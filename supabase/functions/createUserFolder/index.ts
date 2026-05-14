import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
      },
    });
  }

  // Skip JWT verification for local development
  console.log("Function called with method:", req.method);

  try {
    const body = await req.json();
    const workspace_id = body.workspace_id;

    if (!workspace_id) {
      return new Response("Missing workspace_id", { 
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
          "Content-Type": "application/json",
        }
      });
    }

    // Check if documents bucket exists, create if not
    const { data: buckets } = await supabase.storage.listBuckets();
    const documentsBucket = buckets?.find(bucket => bucket.id === 'documents');
    
    if (!documentsBucket) {
      console.log("Creating documents bucket...");
      const { error: bucketError } = await supabase.storage.createBucket('documents', {
        public: false,
        fileSizeLimit: 52428800, // 50MB
        allowedMimeTypes: null
      });
      
      if (bucketError) {
        console.error("Error creating bucket:", bucketError);
        throw bucketError;
      }
    }

    const folderName = `workspace-${workspace_id}/`;

    // Create a placeholder file
    const { error: keepError } = await supabase.storage
      .from("documents")
      .upload(`${folderName}.keep`, new Uint8Array([0]), { upsert: true });

    if (keepError) throw keepError;

    // Create a welcome text file
    const welcomeContent = `Welcome to your workspace folder, ${workspace_id}!\n\nThis folder was created on ${new Date().toISOString()}.\nYou can upload your documents here.`;
    const { error: textError } = await supabase.storage
      .from("documents")
      .upload(`${folderName}welcome.txt`, new TextEncoder().encode(welcomeContent), { upsert: true });

    if (textError) throw textError;

    return new Response(JSON.stringify({ 
      folder: folderName, 
      files: ['.keep', 'welcome.txt'],
      message: "Folder created successfully with welcome file"
    }), { 
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
        "Content-Type": "application/json",
      }
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: (error as any).message }), { 
      status: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
        "Content-Type": "application/json",
      }
    });
  }
});

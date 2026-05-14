import { useEffect, useState } from 'react'
import { supabase } from '../utils/supabaseClient'

// Defining the structure of the document object
interface Document {
    id: string;
    name: string;
    status: string;
    url: string;
    created_at: string;
}

// Defining the Inbox component, which will display the list of documents that have not been processed.
export default function Inbox() {

    // documents: current value, 
    // setDocuments: function to update the value of documents, 
    // useState<Document[]>([]): initial value is an empty array of Document objects
    const [documents, setDocuments] = useState<Document[]>([])
    const [loading, setLoading] = useState(true)
    
    // useEffect hook to fetch the documents from the database
    useEffect(() => {

        // aync - function waits for things
        const fetchDocuments = async () => {
            try {
                // Get current user, or return error if no user is logged in
                // await - wait for this to complete before moving on
                const { data: { user } } = await supabase.auth.getUser() // From data in the supabase response, get the user object
                if (!user) {
                    console.log('No user logged in')
                    setLoading(false)
                    return
                }

                // Get user's organization_id for folder naming
                const { data: userData, error: userError } = await supabase
                    .from('users')
                    .select('organization_id')
                    .eq('id', user.id)
                    .single();

                if (userError || !userData?.organization_id) {
                    console.error('Failed to get organization_id:', userError);
                    setLoading(false);
                    return;
                }

                // List files from user's organization folder in Supabase storage
                const userFolderPath = `organization-${userData.organization_id}`;
                console.log('Looking for files in folder:', userFolderPath);
                
                const { data: files, error } = await supabase.storage
                    .from('documents')
                    .list(userFolderPath, {
                        limit: 100,
                        offset: 0,
                        sortBy: { column: 'created_at', order: 'desc' }
                    })

                if (error) {
                    console.error('Error fetching documents:', error)
                    setLoading(false)
                    return
                }

                // Transform files to document format
                const documentList: Document[] = files.map(file => ({
                    id: file.id || file.name,
                    name: file.name,
                    status: 'unprocessed', // All uploaded files are unprocessed by default
                    url: '', // We'll generate this if needed
                    created_at: file.created_at || new Date().toISOString()
                }))

                setDocuments(documentList)
            } catch (error) {
                console.error('Error fetching documents:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchDocuments()
    }, [])
    // [] "only run once when component loads"
    
    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-4">Document Inbox</h1>
            
            {loading ? (
                <div className="flex items-center justify-center py-8">
                    <div className="text-gray-500">Loading documents...</div>
                </div>
            ) : documents.length === 0 ? (
                <div className="text-center py-8">
                    <p className="text-gray-500 text-lg">No documents found</p>
                    <p className="text-gray-400 text-sm mt-2">Upload some documents to see them here</p>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="text-sm text-gray-600 mb-4">
                        Found {documents.length} document{documents.length !== 1 ? 's' : ''}
                    </div>
                    <div className="grid gap-4">
                        {documents.map((doc) => (
                            <div key={doc.id} className="p-4 border rounded-lg shadow-sm hover:bg-gray-50 transition-colors">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <h3 className="text-lg font-semibold text-gray-900">{doc.name}</h3>
                                        <div className="mt-2 flex items-center space-x-4 text-sm text-gray-500">
                                            <span className="flex items-center">
                                                <span className="w-2 h-2 bg-yellow-400 rounded-full mr-2"></span>
                                                {doc.status}
                                            </span>
                                            <span>Uploaded: {new Date(doc.created_at).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                    <div className="ml-4">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                            Pending Processing
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
    }
    
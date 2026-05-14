// src/pages/DragDropPage.tsx
import { useState, DragEvent, ChangeEvent, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  uploadedAt: Date;
  status: 'uploading' | 'success' | 'error';
  error?: string;
}

interface ProcessingDocument {
  id: string;
  document_id: string;
  file_path: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  retry_count: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  processing_started_at: string | null;
  processing_completed_at: string | null;
}

export default function DragDropPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [userFolder, setUserFolder] = useState<string | null>(null);
  const [processingDocuments, setProcessingDocuments] = useState<ProcessingDocument[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);

  // Get current user and their folder
  useEffect(() => {
    const getUserFolder = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Get user's organization_id for folder naming
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('organization_id')
          .eq('id', user.id)
          .single();
        
        if (userData?.organization_id) {
          setUserFolder(`organization-${userData.organization_id}`);
          setOrganizationId(userData.organization_id);
        } else {
          console.error('Failed to get organization_id:', userError);
          setUserFolder(`users/user-${user.id}`); // Fallback to old naming
        }
      }
    };
    getUserFolder();
  }, []);

  // Fetch processing documents
  const fetchProcessingDocuments = async () => {
    if (!organizationId) return;

    try {
      const { data, error } = await supabase
        .from('processing_queue')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching processing documents:', error);
      } else {
        setProcessingDocuments(data || []);
      }
    } catch (error) {
      console.error('Error fetching processing documents:', error);
    }
  };

  // Fetch documents when organization_id is available
  useEffect(() => {
    if (organizationId) {
      fetchProcessingDocuments();

      // Set up real-time subscription
      const subscription = supabase
        .channel('processing_queue_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'processing_queue',
            filter: `organization_id=eq.${organizationId}`
          },
          (payload) => {
            console.log('Processing queue change:', payload);
            fetchProcessingDocuments();
          }
        )
        .subscribe();

      // Refresh every 5 seconds as backup
      const interval = setInterval(fetchProcessingDocuments, 5000);

      return () => {
        subscription.unsubscribe();
        clearInterval(interval);
      };
    }
  }, [organizationId]);

    // Upload file to Supabase storage in unprocessed folder
    const uploadFile = async (file: File): Promise<UploadedFile> => {
    // Get current user to ensure we have the correct folder
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Get user's organization_id for folder naming
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single();
    
    if (userError || !userData?.organization_id) {
      throw new Error('Failed to get organization information');
    }

    // Upload to unprocessed folder
    const unprocessedFolder = `organization-${userData.organization_id}/unprocessed`;
    const fileId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const filePath = `${unprocessedFolder}/${fileId}-${file.name}`;

    console.log('Uploading to unprocessed folder:', filePath);

    const { data, error } = await supabase.storage
      .from('documents')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('Upload error details:', error);
      throw error;
    }

    console.log('✅ File uploaded successfully:', data.path);

    // Add document to processing queue
    try {
      // Document type will be determined during processing (AI classification or manual assignment)
      const { error: queueError } = await supabase
        .from('processing_queue')
        .insert({
          organization_id: userData.organization_id,
          user_id: user.id,
          document_id: fileId,
          file_path: filePath,
          status: 'pending',
          file_name: file.name,
        });
      
      if (queueError) {
        console.error('Error adding to processing queue:', queueError);
      } else {
        console.log('✅ Document added to processing queue');
      }
    } catch (error) {
      console.error('Error creating processing queue entry:', error);
    }

    return {
      id: fileId,
      name: file.name,
      size: file.size,
      type: file.type,
      url: '', // No public URL for unprocessed files
      uploadedAt: new Date(),
      status: 'success'
    };
  };

  // Handle file upload
  const handleUpload = async () => {
    if (!userFolder) {
      alert('Please log in to upload files');
      return;
    }

    if (files.length === 0) {
      alert('No files to upload');
      return;
    }

    setIsUploading(true);
    const uploadPromises = files.map(async (file) => {
      const fileId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Add to uploaded files with uploading status
      const uploadingFile: UploadedFile = {
        id: fileId,
        name: file.name,
        size: file.size,
        type: file.type,
        url: '',
        uploadedAt: new Date(),
        status: 'uploading'
      };
      
      setUploadedFiles(prev => [...prev, uploadingFile]);

      try {
        const uploadedFile = await uploadFile(file);
        setUploadedFiles(prev => 
          prev.map(f => f.id === fileId ? uploadedFile : f)
        );
      } catch (error) {
        console.error('Upload error:', error);
        setUploadedFiles(prev => 
          prev.map(f => f.id === fileId ? {
            ...f,
            status: 'error',
            error: error instanceof Error ? error.message : 'Upload failed'
          } : f)
        );
      }
    });

    await Promise.all(uploadPromises);
    setIsUploading(false);
    setFiles([]); // Clear the files array after upload
  };

  // Drag & drop handlers
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    setFiles((prev) => [...prev, ...droppedFiles]);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => e.preventDefault();

  // File input handler
  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...selectedFiles]);
    }
  };

  // Remove file from upload queue
  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Format date/time
  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  // Get status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'processing':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Extract filename from file_path
  const getFileName = (filePath: string) => {
    return filePath.split('/').pop() || filePath;
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Document Upload</h1>

      {/* User Folder Info */}
      {userFolder && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
          <p className="text-sm text-blue-700">
            📁 Uploading to folder: <strong>{userFolder}</strong>
          </p>
        </div>
      )}

      {/* Drag & Drop Section */}
      <div
        className="border-2 border-dashed border-gray-400 p-10 text-center mb-6 hover:border-blue-500 transition-colors"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <div className="space-y-4">
          <div className="text-gray-600">
            <p className="text-lg">📁 Drag and drop files here</p>
            <p className="text-sm">or</p>
          </div>
          <input
            type="file"
            multiple
            onChange={handleFileInput}
            className="block mx-auto"
            accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif"
          />
        </div>
      </div>

      {/* Files to Upload */}
      {files.length > 0 && (
        <div className="mb-6">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold">Files to Upload ({files.length}):</h2>
            <button
              onClick={handleUpload}
              disabled={isUploading || !userFolder}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploading ? 'Uploading...' : 'Upload All'}
            </button>
          </div>
          <div className="space-y-2">
            {files.map((file, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded border">
                <div className="flex-1">
                  <p className="font-medium">{file.name}</p>
                  <p className="text-sm text-gray-500">{formatFileSize(file.size)} • {file.type}</p>
                </div>
                <button
                  onClick={() => removeFile(index)}
                  className="text-red-500 hover:text-red-700 ml-2"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Uploaded Files */}
      {uploadedFiles.length > 0 && (
        <div className="mb-6">
          <h2 className="font-semibold mb-3">Uploaded Files ({uploadedFiles.length}):</h2>
          <div className="space-y-2">
            {uploadedFiles.map((file) => (
              <div key={file.id} className="flex items-center justify-between p-3 bg-gray-50 rounded border">
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <p className="font-medium">{file.name}</p>
                    {file.status === 'uploading' && (
                      <span className="text-blue-500 text-sm">⏳ Uploading...</span>
                    )}
                    {file.status === 'success' && (
                      <span className="text-green-500 text-sm">✅ Uploaded</span>
                    )}
                    {file.status === 'error' && (
                      <span className="text-red-500 text-sm">❌ Failed</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">
                    {formatFileSize(file.size)} • {file.type}
                  </p>
                  {file.error && (
                    <p className="text-sm text-red-500">{file.error}</p>
                  )}
                </div>
                {file.status === 'success' && file.url && (
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:text-blue-700 ml-2"
                  >
                    View
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Processing Queue Section */}
      <div className="mt-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Processing Queue</h2>
          <button
            onClick={fetchProcessingDocuments}
            className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded"
          >
            🔄 Refresh
          </button>
        </div>

        {/* Summary Stats - Now at the top */}
        {processingDocuments.length > 0 && (
          <div className="mb-6 grid grid-cols-4 gap-4">
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded">
              <p className="text-sm text-yellow-700 font-semibold">Pending</p>
              <p className="text-2xl font-bold text-yellow-800">
                {processingDocuments.filter(d => d.status === 'pending').length}
              </p>
            </div>
            <div className="p-4 bg-blue-50 border border-blue-200 rounded">
              <p className="text-sm text-blue-700 font-semibold">Processing</p>
              <p className="text-2xl font-bold text-blue-800">
                {processingDocuments.filter(d => d.status === 'processing').length}
              </p>
            </div>
            <div className="p-4 bg-green-50 border border-green-200 rounded">
              <p className="text-sm text-green-700 font-semibold">Completed</p>
              <p className="text-2xl font-bold text-green-800">
                {processingDocuments.filter(d => d.status === 'completed').length}
              </p>
            </div>
            <div className="p-4 bg-red-50 border border-red-200 rounded">
              <p className="text-sm text-red-700 font-semibold">Failed</p>
              <p className="text-2xl font-bold text-red-800">
                {processingDocuments.filter(d => d.status === 'failed').length}
              </p>
            </div>
          </div>
        )}

        {processingDocuments.length === 0 ? (
          <div className="p-8 text-center bg-gray-50 rounded border border-gray-200">
            <p className="text-gray-500">No documents in queue. Upload a document to get started!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse border border-gray-300">
              <thead className="bg-gray-50">
                <tr>
                  <th className="border border-gray-300 px-4 py-2 text-left text-sm font-semibold">File Name</th>
                  <th className="border border-gray-300 px-4 py-2 text-left text-sm font-semibold">Status</th>
                  <th className="border border-gray-300 px-4 py-2 text-left text-sm font-semibold">Uploaded</th>
                  <th className="border border-gray-300 px-4 py-2 text-left text-sm font-semibold">Started</th>
                  <th className="border border-gray-300 px-4 py-2 text-left text-sm font-semibold">Completed</th>
                  <th className="border border-gray-300 px-4 py-2 text-left text-sm font-semibold">Retries</th>
                  <th className="border border-gray-300 px-4 py-2 text-left text-sm font-semibold">Error</th>
                </tr>
              </thead>
              <tbody>
                {processingDocuments.map((doc) => (
                  <tr key={doc.id} className="hover:bg-gray-50">
                    <td className="border border-gray-300 px-4 py-2 text-sm">
                      {getFileName(doc.file_path)}
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${getStatusColor(doc.status)}`}>
                        {doc.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="border border-gray-300 px-4 py-2 text-sm text-gray-600">
                      {formatDateTime(doc.created_at)}
                    </td>
                    <td className="border border-gray-300 px-4 py-2 text-sm text-gray-600">
                      {doc.processing_started_at ? formatDateTime(doc.processing_started_at) : '—'}
                    </td>
                    <td className="border border-gray-300 px-4 py-2 text-sm text-gray-600">
                      {doc.processing_completed_at ? formatDateTime(doc.processing_completed_at) : '—'}
                    </td>
                    <td className="border border-gray-300 px-4 py-2 text-sm text-center">
                      {doc.retry_count > 0 ? (
                        <span className="text-orange-600 font-semibold">{doc.retry_count}</span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className="border border-gray-300 px-4 py-2 text-sm">
                      {doc.error_message ? (
                        <span className="text-red-600 text-xs" title={doc.error_message}>
                          {doc.error_message.length > 50 
                            ? doc.error_message.substring(0, 50) + '...' 
                            : doc.error_message}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

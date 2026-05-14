import React, { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import { User } from '@supabase/supabase-js';

interface DocumentType {
  id: string;
  name: string;
  description: string;
  schema_definition: Record<string, any>;
  created_at: string;
  updated_at: string;
}

interface SchemaField {
  name: string;
  type: 'text' | 'number' | 'date' | 'boolean' | 'email' | 'url';
  required: boolean;
  description?: string;
  samples?: string[]; // Sample values for ML training
}

interface OrderLineField {
  name: string;
  type: 'text' | 'number' | 'date' | 'boolean' | 'email' | 'url';
  required: boolean;
  description?: string;
  samples?: string[]; // Sample values for ML training
}

export default function SchemaEditor() {
  const [user, setUser] = useState<User | null>(null);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingType, setEditingType] = useState<DocumentType | null>(null);
  const [editingSchema, setEditingSchema] = useState<SchemaField[]>([]);
  const [showSchemaEditor, setShowSchemaEditor] = useState(false);
  const [editingField, setEditingField] = useState<{typeIndex: number, fieldIndex: number} | null>(null);
  const [showFieldEditor, setShowFieldEditor] = useState(false);
  const [showAddField, setShowAddField] = useState(false);
  const [addingToTypeIndex, setAddingToTypeIndex] = useState<number | null>(null);
  const [newField, setNewField] = useState<SchemaField>({
    name: '',
    type: 'text',
    required: false,
    description: '',
    samples: []
  });
  const [showAddOrderLineField, setShowAddOrderLineField] = useState(false);
  const [showEditField, setShowEditField] = useState(false);
  const [editingFieldIndex, setEditingFieldIndex] = useState<number | null>(null);
  const [editingTypeIndex, setEditingTypeIndex] = useState<number | null>(null);
  const [editField, setEditField] = useState<SchemaField>({
    name: '',
    type: 'text',
    required: false,
    description: '',
    samples: []
  });
  const [addingOrderLineToTypeIndex, setAddingOrderLineToTypeIndex] = useState<number | null>(null);
  const [newOrderLineField, setNewOrderLineField] = useState<OrderLineField>({
    name: '',
    type: 'text',
    required: false,
    description: '',
    samples: []
  });
  const [showEditDocumentType, setShowEditDocumentType] = useState(false);
  const [editingDocumentType, setEditingDocumentType] = useState<DocumentType | null>(null);
  const [editTypeName, setEditTypeName] = useState('');
  const [editTypeDescription, setEditTypeDescription] = useState('');
  const [editTypeContainsOrderLines, setEditTypeContainsOrderLines] = useState(false);
  const [showEditOrderLineField, setShowEditOrderLineField] = useState(false);
  const [editingOrderLineField, setEditingOrderLineField] = useState<{typeIndex: number, fieldIndex: number} | null>(null);
  const [editOrderLineField, setEditOrderLineField] = useState<OrderLineField>({
    name: '',
    type: 'text',
    required: false,
    description: '',
    samples: []
  });
  const [schemaStatus, setSchemaStatus] = useState<{[key: string]: boolean}>({});
  const [error, setError] = useState<string | null>(null);

  // Form states for adding new document type
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeDescription, setNewTypeDescription] = useState('');
  const [newTypeContainsOrderLines, setNewTypeContainsOrderLines] = useState(false);

  useEffect(() => {
    // Get the current user
    const getUser = async () => {
      console.log('Getting user...');
      const { data: { user }, error } = await supabase.auth.getUser();
      console.log('User auth result:', { user, error });
      setUser(user);
    };

    getUser();
  }, []);

  useEffect(() => {
    if (user) {
      fetchDocumentTypes();
    }
  }, [user]);

  const fetchDocumentTypes = async () => {
    if (!user) {
      console.log('No user found, skipping fetchDocumentTypes');
      return;
    }
    
    console.log('Fetching document types for user:', user.id);
    setLoading(true);
    try {
      // First, let's test if we can access the table at all
      console.log('Testing table access...');
      const { data: testData, error: testError } = await supabase
        .from('document_types')
        .select('*')
        .limit(1);
      
      console.log('Table access test:', { testData, testError });
      
      if (testError) {
        console.error('Table access failed:', testError);
        throw testError;
      }
      
      // Now try the actual query - RLS policies will automatically filter by organization
      const { data, error } = await supabase
        .from('document_types')
        .select('*')
        .order('created_at', { ascending: false });

      console.log('Document types query result:', { data, error });
      
      if (error) throw error;
      setDocumentTypes(data || []);
    } catch (error) {
      console.error('Error fetching document types:', error);
    } finally {
      setLoading(false);
    }
  };

  const addDocumentType = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    console.log('addDocumentType called with:', { user: user?.id, newTypeName, newTypeDescription });
    
    if (!user || !newTypeName.trim()) {
      console.log('Validation failed:', { user: !!user, newTypeName: newTypeName.trim() });
      setError('Please provide a document type name');
      return;
    }

    try {
      // First test table access
      console.log('Testing table access before insert...');
      const { data: testData, error: testError } = await supabase
        .from('document_types')
        .select('*')
        .limit(1);
      
      console.log('Table access test before insert:', { testData, testError });
      
      if (testError) {
        console.error('Table access failed before insert:', testError);
        setError(`Table access failed: ${testError.message}`);
        return;
      }
      
      console.log('Attempting to insert document type...');
      
      // Get user's organization_id (organization_id) first
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', user.id)
        .single();
      
      if (userError || !userData?.organization_id) {
        console.error('Failed to get user organization_id:', userError);
        setError('Failed to get organization information. Please try again.');
        return;
      }
      
      const { data, error } = await supabase
        .from('document_types')
        .insert({
          user_id: user.id, // Keep user_id for tracking who created it
          organization_id: userData.organization_id, // Add organization_id for RLS
          name: newTypeName.trim(),
          description: newTypeDescription.trim(),
          schema_definition: {
            fields: [],
            contains_order_lines: newTypeContainsOrderLines,
            order_line_fields: newTypeContainsOrderLines ? [] : undefined
          }
        })
        .select()
        .single();

      console.log('Insert result:', { data, error });

      if (error) {
        console.error('Supabase error:', error);
        setError(`Failed to add document type: ${error.message}`);
        return;
      }
      
      setDocumentTypes([data, ...documentTypes]);
      setNewTypeName('');
      setNewTypeDescription('');
      setNewTypeContainsOrderLines(false);
      setShowAddForm(false);
      console.log('Document type added successfully');
      
      // Automatically update the user's schema
      updateUserSchema(data.id);
    } catch (error) {
      console.error('Error adding document type:', error);
      setError(`Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const deleteDocumentType = async (id: string) => {
    if (!confirm('Are you sure you want to delete this document type? This will also delete all associated tables and data.')) return;

    try {
      // Get the document type to find its name for table deletion
      const { data: docType, error: fetchError } = await supabase
        .from('document_types')
        .select('name, organization_id')
        .eq('id', id)
        .single();
      
      if (fetchError || !docType) {
        console.error('Error fetching document type for deletion:', fetchError);
        setError('Failed to fetch document type for deletion');
        return;
      }

      // Get user's organization_id for schema name
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', user.id)
        .single();
      
      if (userError || !userData?.organization_id) {
        console.error('Failed to get user organization_id:', userError);
        setError('Failed to get organization information');
        return;
      }

      // Delete the document type from database
      const { error } = await supabase
        .from('document_types')
        .delete()
        .eq('id', id);
      
      if (error) {
        console.error('Error deleting document type:', error);
        setError('Failed to delete document type');
        return;
      }

      // Delete the associated tables from the workspace schema
      await deleteDocumentTables(docType.name, userData.organization_id);
      
      // Update local state
      setDocumentTypes(documentTypes.filter(type => type.id !== id));
    } catch (error) {
      console.error('Error deleting document type:', error);
      setError('Failed to delete document type');
    }
  };

  // Function to delete tables associated with a document type
  const deleteDocumentTables = async (documentTypeName: string, organizationId: string) => {
    try {
      console.log('🗑️ Deleting tables for document type:', documentTypeName);
      
      const schemaName = `organization_${organizationId.toString().replace(/-/g, '_')}`;
      const tableName = documentTypeName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      
      // Delete main table
      const { data: mainResult, error: mainError } = await supabase.rpc('exec_sql', {
        sql_query: `DROP TABLE IF EXISTS ${schemaName}.${tableName} CASCADE`
      });
      
      console.log('Main table deletion result:', { mainResult, mainError });
      
      // Delete order line table if it exists
      const { data: orderLineResult, error: orderLineError } = await supabase.rpc('exec_sql', {
        sql_query: `DROP TABLE IF EXISTS ${schemaName}.${tableName}_order_lines CASCADE`
      });
      
      console.log('Order line table deletion result:', { orderLineResult, orderLineError });
      
      console.log('✅ Tables deleted successfully');
    } catch (error) {
      console.error('❌ Error deleting tables:', error);
    }
  };


  const saveSchema = async () => {
    if (!editingType) return;

    try {
      const { error } = await supabase
        .from('document_types')
        .update({
          schema_definition: { 
            ...editingType.schema_definition,
            fields: editingSchema 
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', editingType.id);

      if (error) throw error;

      // Update local state
      setDocumentTypes(documentTypes.map(type => 
        type.id === editingType.id 
          ? { ...type, schema_definition: { ...editingType.schema_definition, fields: editingSchema } }
          : type
      ));

      setShowSchemaEditor(false);
      setEditingType(null);
      setEditingSchema([]);
    } catch (error) {
      console.error('Error saving schema:', error);
    }
  };

  const addSchemaField = () => {
    setEditingSchema([...editingSchema, {
      name: '',
      type: 'text',
      required: false,
      description: '',
      samples: []
    }]);
  };

  const updateSchemaField = (index: number, field: Partial<SchemaField>) => {
    const updated = [...editingSchema];
    updated[index] = { ...updated[index], ...field };
    setEditingSchema(updated);
  };

  const removeSchemaField = (index: number) => {
    setEditingSchema(editingSchema.filter((_, i) => i !== index));
  };

  const addSampleToField = (fieldIndex: number, sample: string) => {
    if (!sample.trim()) return;
    
    const updated = [...editingSchema];
    if (!updated[fieldIndex].samples) {
      updated[fieldIndex].samples = [];
    }
    updated[fieldIndex].samples = [...updated[fieldIndex].samples, sample.trim()];
    setEditingSchema(updated);
  };

  const removeSampleFromField = (fieldIndex: number, sampleIndex: number) => {
    const updated = [...editingSchema];
    if (updated[fieldIndex].samples) {
      updated[fieldIndex].samples = updated[fieldIndex].samples.filter((_, i) => i !== sampleIndex);
    }
    setEditingSchema(updated);
  };

  const openEditField = (typeIndex: number, fieldIndex: number) => {
    const documentType = documentTypes[typeIndex];
    const field = documentType.schema_definition.fields[fieldIndex];
    
    setEditingTypeIndex(typeIndex);
    setEditingFieldIndex(fieldIndex);
    setEditField(field);
    setShowEditField(true);
  };

  const saveFieldEdit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (editingTypeIndex === null || editingFieldIndex === null) return;

    const documentType = documentTypes[editingTypeIndex];
    const updatedFields = [...documentType.schema_definition.fields];
    updatedFields[editingFieldIndex] = editField;

    try {
      const { error } = await supabase
        .from('document_types')
        .update({
          schema_definition: {
            ...documentType.schema_definition,
            fields: updatedFields
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', documentType.id);

      if (error) throw error;

      const updatedDocumentTypes = documentTypes.map((type, index) => 
        index === editingTypeIndex 
          ? { ...type, schema_definition: { ...type.schema_definition, fields: updatedFields } }
          : type
      );
      setDocumentTypes(updatedDocumentTypes);

      // Update editingType if it's the same document type being edited
      if (editingType && editingType.id === documentType.id) {
        setEditingType({
          ...editingType,
          schema_definition: {
            ...editingType.schema_definition,
            fields: updatedFields
          }
        });
      }

      setShowEditField(false);
      setEditingFieldIndex(null);
      setEditingTypeIndex(null);
      setEditField({ name: '', type: 'text', required: false, description: '', samples: [] });
      
      // Automatically update the user's schema
      updateUserSchema(documentType.id);
    } catch (error) {
      console.error('Error saving field:', error);
    }
  };

  const deleteField = async (typeIndex: number, fieldIndex: number) => {
    if (!confirm('Are you sure you want to delete this field?')) return;

    const documentType = documentTypes[typeIndex];
    if (!documentType) {
      console.error('Document type not found at index:', typeIndex);
      setError('Document type not found. Please refresh the page.');
      return;
    }
    
    const updatedFields = documentType.schema_definition.fields.filter((_: any, i: number) => i !== fieldIndex);

    try {
      const { error } = await supabase
        .from('document_types')
        .update({
          schema_definition: { 
            ...documentType.schema_definition,
            fields: updatedFields 
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', documentType.id);

      if (error) throw error;

      // Update local state
      const updatedDocumentTypes = documentTypes.map((type, i) => 
        i === typeIndex 
          ? { 
              ...type, 
              schema_definition: { 
                ...type.schema_definition,
                fields: updatedFields 
              } 
            }
          : type
      );
      setDocumentTypes(updatedDocumentTypes);

      // Update editingType if it's the same document type being edited
      if (editingType && editingType.id === documentType.id) {
        setEditingType({
          ...editingType,
          schema_definition: {
            ...editingType.schema_definition,
            fields: updatedFields
          }
        });
      }

      // Remove the column from the database
      const fieldToDelete = documentType.schema_definition.fields[fieldIndex];
      if (fieldToDelete) {
        await removeColumnFromDatabase(documentType.name, fieldToDelete.name, false);
      }

      // Trigger schema update to remove the column
      await updateUserSchema(documentType.id);
    } catch (error) {
      console.error('Error deleting field:', error);
    }
  };


  const openAddField = (typeIndex: number) => {
    setAddingToTypeIndex(typeIndex);
    setNewField({
      name: '',
      type: 'text',
      required: false,
      description: '',
      samples: []
    });
    setShowAddField(true);
  };

  const addNewField = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (addingToTypeIndex === null || !newField.name.trim()) return;

    const documentType = documentTypes[addingToTypeIndex];
    const updatedFields = [...(documentType.schema_definition.fields || []), newField];

    try {
      const { error } = await supabase
        .from('document_types')
        .update({
          schema_definition: { 
            ...documentType.schema_definition,
            fields: updatedFields 
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', documentType.id);

      if (error) throw error;

      // Update local state
      const updatedDocumentTypes = documentTypes.map((type, i) => 
        i === addingToTypeIndex 
          ? { 
              ...type, 
              schema_definition: { 
                ...type.schema_definition,
                fields: updatedFields 
              } 
            }
          : type
      );
      setDocumentTypes(updatedDocumentTypes);

      // Update editingType if it's the same document type being edited
      if (editingType && editingType.id === documentType.id) {
        setEditingType({
          ...editingType,
          schema_definition: {
            ...editingType.schema_definition,
            fields: updatedFields
          }
        });
      }

      setShowAddField(false);
      setAddingToTypeIndex(null);
      setNewField({
        name: '',
        type: 'text',
        required: false,
        description: '',
        samples: []
      });
      
      // Automatically update the user's schema
      updateUserSchema(documentType.id);
    } catch (error) {
      console.error('Error adding field:', error);
    }
  };

  const addSampleToNewField = (sample: string) => {
    if (!sample.trim()) return;
    setNewField(prev => ({
      ...prev,
      samples: [...(prev.samples || []), sample.trim()]
    }));
  };

  const removeSampleFromNewField = (sampleIndex: number) => {
    setNewField(prev => ({
      ...prev,
      samples: prev.samples?.filter((_, i) => i !== sampleIndex) || []
    }));
  };

  const addSampleToNewOrderLineField = (sample: string) => {
    if (!sample.trim()) return;
    setNewOrderLineField(prev => ({
      ...prev,
      samples: [...(prev.samples || []), sample.trim()]
    }));
  };

  const removeSampleFromNewOrderLineField = (sampleIndex: number) => {
    setNewOrderLineField(prev => ({
      ...prev,
      samples: prev.samples?.filter((_, i) => i !== sampleIndex) || []
    }));
  };

  const openAddOrderLineField = (typeIndex: number) => {
    setAddingOrderLineToTypeIndex(typeIndex);
    setNewOrderLineField({
      name: '',
      type: 'text',
      required: false,
      description: '',
      samples: []
    });
    setShowAddOrderLineField(true);
  };

  const addNewOrderLineField = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (addingOrderLineToTypeIndex === null || !newOrderLineField.name.trim()) return;

    const documentType = documentTypes[addingOrderLineToTypeIndex];
    const currentOrderLineFields = documentType.schema_definition.order_line_fields || [];
    const updatedOrderLineFields = [...currentOrderLineFields, newOrderLineField];

    try {
      const { error } = await supabase
        .from('document_types')
        .update({
          schema_definition: { 
            ...documentType.schema_definition,
            order_line_fields: updatedOrderLineFields 
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', documentType.id);

      if (error) throw error;

        // Update local state
        const updatedDocumentTypes = documentTypes.map((type, i) => 
          i === addingOrderLineToTypeIndex 
            ? { 
                ...type, 
                schema_definition: { 
                  ...type.schema_definition,
                  order_line_fields: updatedOrderLineFields 
                } 
              }
            : type
        );
        setDocumentTypes(updatedDocumentTypes);

        // Update editingType if it's the same document type being edited
        if (editingType && editingType.id === documentType.id) {
          setEditingType({
            ...editingType,
            schema_definition: {
              ...editingType.schema_definition,
              order_line_fields: updatedOrderLineFields
            }
          });
        }

        // Refresh editing document type if it's the same one
        if (editingDocumentType && documentTypes[addingOrderLineToTypeIndex].id === editingDocumentType.id) {
          const updatedType = documentTypes[addingOrderLineToTypeIndex];
          setEditingDocumentType({
            ...updatedType,
            schema_definition: {
              ...updatedType.schema_definition,
              order_line_fields: updatedOrderLineFields
            }
          });
        }

        setShowAddOrderLineField(false);
        setAddingOrderLineToTypeIndex(null);
        setNewOrderLineField({
          name: '',
          type: 'text',
          required: false,
          description: '',
          samples: []
        });

        // Trigger schema update to add the new order line column
        await updateUserSchema(documentType.id);
    } catch (error) {
      console.error('Error adding order line field:', error);
    }
  };

  const deleteOrderLineField = async (typeIndex: number, fieldIndex: number) => {
    if (!confirm('Are you sure you want to delete this order line field?')) return;

    const documentType = documentTypes[typeIndex];
    if (!documentType) {
      console.error('Document type not found at index:', typeIndex);
      setError('Document type not found. Please refresh the page.');
      return;
    }
    
    const currentOrderLineFields = documentType.schema_definition.order_line_fields || [];
    const updatedOrderLineFields = currentOrderLineFields.filter((_: any, i: number) => i !== fieldIndex);

    try {
      const { error } = await supabase
        .from('document_types')
        .update({
          schema_definition: { 
            ...documentType.schema_definition,
            order_line_fields: updatedOrderLineFields 
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', documentType.id);

      if (error) throw error;

        // Update local state
        const updatedDocumentTypes = documentTypes.map((type, i) => 
          i === typeIndex 
            ? { 
                ...type, 
                schema_definition: { 
                  ...type.schema_definition,
                  order_line_fields: updatedOrderLineFields 
                } 
              }
            : type
        );
        setDocumentTypes(updatedDocumentTypes);

        // Update editingType if it's the same document type being edited
        if (editingType && editingType.id === documentType.id) {
          setEditingType({
            ...editingType,
            schema_definition: {
              ...editingType.schema_definition,
              order_line_fields: updatedOrderLineFields
            }
          });
        }

        // Refresh editing document type if it's the same one
        if (editingDocumentType && documentTypes[typeIndex].id === editingDocumentType.id) {
          const updatedType = documentTypes[typeIndex];
          setEditingDocumentType({
            ...updatedType,
            schema_definition: {
              ...updatedType.schema_definition,
              order_line_fields: updatedOrderLineFields
            }
          });
        }

        // Remove the order line column from the database
        const fieldToDelete = currentOrderLineFields[fieldIndex];
        if (fieldToDelete) {
          await removeColumnFromDatabase(documentType.name, fieldToDelete.name, true);
        }

        // Trigger schema update to remove the order line column
        await updateUserSchema(documentType.id);
    } catch (error) {
      console.error('Error deleting order line field:', error);
    }
  };

  const openEditOrderLineField = (typeIndex: number, fieldIndex: number) => {
    const documentType = documentTypes[typeIndex];
    const field = documentType.schema_definition.order_line_fields[fieldIndex];
    
    setEditingOrderLineField({ typeIndex, fieldIndex });
    setEditOrderLineField(field);
    setShowEditOrderLineField(true);
  };

  const saveOrderLineFieldEdit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingOrderLineField) return;

    const typeIndex = editingOrderLineField.typeIndex;
    const fieldIndex = editingOrderLineField.fieldIndex;
    const documentType = documentTypes[typeIndex];
    
    const updatedOrderLineFields = [...(documentType.schema_definition.order_line_fields || [])];
    updatedOrderLineFields[fieldIndex] = editOrderLineField;

    try {
      const { error } = await supabase
        .from('document_types')
        .update({
          schema_definition: { 
            ...documentType.schema_definition,
            order_line_fields: updatedOrderLineFields 
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', documentType.id);

      if (error) throw error;

      // Update local state
      const updatedDocumentTypes = documentTypes.map((type, i) => 
        i === typeIndex 
          ? { 
              ...type, 
              schema_definition: { 
                ...type.schema_definition,
                order_line_fields: updatedOrderLineFields 
              } 
            }
          : type
      );
      setDocumentTypes(updatedDocumentTypes);

      // Update editingType if it's the same document type being edited
      if (editingType && editingType.id === documentType.id) {
        setEditingType({
          ...editingType,
          schema_definition: {
            ...editingType.schema_definition,
            order_line_fields: updatedOrderLineFields
          }
        });
      }

      // Refresh editing document type if it's the same one
      if (editingDocumentType && documentTypes[typeIndex].id === editingDocumentType.id) {
        const updatedType = documentTypes[typeIndex];
        setEditingDocumentType({
          ...updatedType,
          schema_definition: {
            ...updatedType.schema_definition,
            order_line_fields: updatedOrderLineFields
          }
        });
      }

      setShowEditOrderLineField(false);
      setEditingOrderLineField(null);
      setEditOrderLineField({
        name: '',
        type: 'text',
        required: false,
        description: '',
        samples: []
      });

      // Trigger schema update to modify the order line column
      await updateUserSchema(documentType.id);
    } catch (error) {
      console.error('Error saving order line field:', error);
    }
  };

  const addSampleToEditOrderLineField = (sample: string) => {
    if (!sample.trim()) return;
    setEditOrderLineField(prev => ({
      ...prev,
      samples: [...(prev.samples || []), sample.trim()]
    }));
  };

  const removeSampleFromEditOrderLineField = (sampleIndex: number) => {
    setEditOrderLineField(prev => ({
      ...prev,
      samples: prev.samples?.filter((_, i) => i !== sampleIndex) || []
    }));
  };

  const removeColumnFromDatabase = async (documentTypeName: string, columnName: string, isOrderLine: boolean) => {
    if (!user) return;
    
    try {
      // Get user's organization_id first
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', user.id)
        .single();
      
      if (userError || !userData?.organization_id) {
        console.error('Failed to get user organization_id:', userError);
        return;
      }

      console.log('Removing column from database:', {
        document_type_name: documentTypeName,
        column_name: columnName,
        is_order_line: isOrderLine,
        organization_id: userData.organization_id
      });

      const response = await fetch(`https://dhkzbmrlgcxaxrwimzjs.supabase.co/functions/v1/removeColumn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({ 
          organization_id: userData.organization_id,
          document_type_name: documentTypeName,
          column_name: columnName,
          is_order_line: isOrderLine
        })
      });
      
      console.log('Remove column response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Remove column error response:', errorText);
        return;
      }
      
      const result = await response.json();
      console.log('Remove column response body:', result);
      
      if (result.success) {
        console.log('✅ Column removed successfully:', result.message);
      } else {
        console.warn('Column removal failed:', result);
      }
    } catch (error) {
      console.error('Error removing column from database:', error);
    }
  };

  const updateUserSchema = async (documentTypeId: string) => {
    if (!user) return;
    
    setError(null);
    
    try {
      // Get user's organization_id first
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', user.id)
        .single();
      
      if (userError || !userData?.organization_id) {
        console.error('Failed to get user organization_id:', userError);
        return;
      }

      console.log('Calling updateUserSchema with:', {
        document_type_id: documentTypeId,
        organization_id: userData.organization_id
      });

      const response = await fetch(`https://dhkzbmrlgcxaxrwimzjs.supabase.co/functions/v1/updateUserSchema`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({ 
          document_type_id: documentTypeId,
          organization_id: userData.organization_id 
        })
      });
      
      console.log('Edge Function response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Edge Function error response:', errorText);
        setError(`Schema update failed: ${response.status} ${response.statusText}`);
        return;
      }
      
      const result = await response.json();
      console.log('Edge Function response body:', result);
      
      if (result.success) {
        console.log('Schema updated successfully:', result);
        console.log('Tables created/updated:', result.executed_statements);
      } else {
        console.warn('Schema update failed:', result);
        // Don't show error to user as this is automatic
      }
    } catch (error) {
      console.error('Error updating schema:', error);
      // Don't show error to user as this is automatic
    }
  };

  // Test schema creation function
  const editSchema = (type: any) => {
    setEditingType(type);
    setEditingSchema(type.schema_definition.fields || []);
    setShowSchemaEditor(true);
  };

  const toggleOrderLines = async (typeIndex: number) => {
    const documentType = documentTypes[typeIndex];
    const newContainsOrderLines = !documentType.schema_definition.contains_order_lines;

    try {
      const { error } = await supabase
        .from('document_types')
        .update({
          schema_definition: { 
            ...documentType.schema_definition,
            contains_order_lines: newContainsOrderLines,
            order_line_fields: newContainsOrderLines ? (documentType.schema_definition.order_line_fields || []) : undefined
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', documentType.id);

      if (error) throw error;

      // Update local state
      setDocumentTypes(documentTypes.map((type, i) => 
        i === typeIndex 
          ? { 
              ...type, 
              schema_definition: { 
                ...type.schema_definition,
                contains_order_lines: newContainsOrderLines,
                order_line_fields: newContainsOrderLines ? (type.schema_definition.order_line_fields || []) : undefined
              } 
            }
          : type
      ));
    } catch (error) {
      console.error('Error toggling order lines:', error);
    }
  };

  const openEditDocumentType = (documentType: DocumentType) => {
    setEditingDocumentType(documentType);
    setEditTypeName(documentType.name);
    setEditTypeDescription(documentType.description || '');
    setEditTypeContainsOrderLines(documentType.schema_definition.contains_order_lines || false);
    setShowEditDocumentType(true);
  };

  const refreshEditingDocumentType = () => {
    if (editingDocumentType) {
      const updatedType = documentTypes.find(type => type.id === editingDocumentType.id);
      if (updatedType) {
        setEditingDocumentType(updatedType);
      }
    }
  };

  const saveDocumentTypeEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDocumentType) return;

    try {
      const { error } = await supabase
        .from('document_types')
        .update({
          name: editTypeName.trim(),
          description: editTypeDescription.trim(),
          schema_definition: {
            ...editingDocumentType.schema_definition,
            contains_order_lines: editTypeContainsOrderLines,
            order_line_fields: editTypeContainsOrderLines ? (editingDocumentType.schema_definition.order_line_fields || []) : undefined
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', editingDocumentType.id);

      if (error) throw error;

      // Update local state
      setDocumentTypes(documentTypes.map(type => 
        type.id === editingDocumentType.id 
          ? { 
              ...type, 
              name: editTypeName.trim(),
              description: editTypeDescription.trim(),
              schema_definition: {
                ...type.schema_definition,
                contains_order_lines: editTypeContainsOrderLines,
                order_line_fields: editTypeContainsOrderLines ? (type.schema_definition.order_line_fields || []) : undefined
              }
            }
          : type
      ));

      setShowEditDocumentType(false);
      setEditingDocumentType(null);
      setEditTypeName('');
      setEditTypeDescription('');
      setEditTypeContainsOrderLines(false);
    } catch (error) {
      console.error('Error updating document type:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Schema Editor</h1>
            <p className="mt-2 text-gray-600">Define document types and their field structures</p>
          </div>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="flex gap-6">
            {/* Left Sidebar - Document Types */}
            <div className="w-80 flex-shrink-0">
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">Document Types</h2>
                  <button
                    type="button"
                    onClick={() => setShowAddForm(true)}
                    className="bg-blue-600 text-white px-3 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  >
                    + Add Type
                  </button>
                </div>

                {documentTypes.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500 text-sm">No document types created yet</p>
                    <p className="text-gray-400 text-xs mt-1">Click "Add Type" to get started</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {documentTypes.map((type, typeIndex) => (
                      <div
                        key={type.id}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          editingType?.id === type.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                        onClick={() => editSchema(type)}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-medium text-gray-900 truncate">{type.name}</h3>
                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{type.description}</p>
                            <div className="flex items-center mt-2 space-x-3">
                              <span className="text-xs text-gray-400">
                                Fields: {(type.schema_definition.fields?.length || 0) + (type.schema_definition.order_line_fields?.length || 0)}
                              </span>
                              {type.schema_definition.contains_order_lines && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                  Order Lines
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex space-x-1 ml-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditDocumentType(type);
                              }}
                              className="text-gray-400 hover:text-blue-600 p-1"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteDocumentType(type.id);
                              }}
                              className="text-gray-400 hover:text-red-600 p-1"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Content - Field Editor */}
            <div className="flex-1">
              {editingType ? (
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900">{editingType.name}</h3>
                      <p className="text-gray-600 mt-1">{editingType.description}</p>
                    </div>
                    <button
                      onClick={() => {
                        setEditingType(null);
                        setEditingSchema([]);
                        setShowSchemaEditor(false);
                      }}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Fields Section */}
                  <div className="mb-8">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-lg font-medium text-gray-900">Fields</h4>
                      <button
                        type="button"
                        onClick={() => openAddField(documentTypes.findIndex(t => t.id === editingType.id))}
                        className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 flex items-center"
                      >
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add Field
                      </button>
                    </div>
                    
                    {editingType.schema_definition.fields && editingType.schema_definition.fields.length > 0 ? (
                      <div className="bg-gray-50 rounded-lg overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-100">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Required</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {editingType.schema_definition.fields.map((field: any, fieldIndex: number) => (
                              <tr key={fieldIndex}>
                                <td className="px-4 py-3 text-sm font-medium text-gray-900">{field.name}</td>
                                <td className="px-4 py-3 text-sm text-gray-500">{field.type}</td>
                                <td className="px-4 py-3 text-sm text-gray-500">
                                  {field.required ? (
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                      Required
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                      Optional
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-500">{field.description || '-'}</td>
                                <td className="px-4 py-3 text-sm text-gray-500">
                                  <div className="flex space-x-2">
                                    <button
                                      type="button"
                                      onClick={() => openEditField(documentTypes.findIndex(t => t.id === editingType.id), fieldIndex)}
                                      className="text-blue-600 hover:text-blue-800"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => deleteField(documentTypes.findIndex(t => t.id === editingType.id), fieldIndex)}
                                      className="text-red-600 hover:text-red-800"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        No fields defined yet. Click "Add Field" to get started.
                      </div>
                    )}
                  </div>

                  {/* Order Lines Section */}
                  {editingType.schema_definition.contains_order_lines && (
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-lg font-medium text-gray-900">Order Line Fields</h4>
                        <button
                          type="button"
                          onClick={() => openAddOrderLineField(documentTypes.findIndex(t => t.id === editingType.id))}
                          className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 flex items-center"
                        >
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          Add Order Line Field
                        </button>
                      </div>
                      
                      {editingType.schema_definition.order_line_fields && editingType.schema_definition.order_line_fields.length > 0 ? (
                        <div className="bg-gray-50 rounded-lg overflow-hidden">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-100">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Required</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {editingType.schema_definition.order_line_fields.map((field: any, fieldIndex: number) => (
                                <tr key={fieldIndex}>
                                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{field.name}</td>
                                  <td className="px-4 py-3 text-sm text-gray-500">{field.type}</td>
                                  <td className="px-4 py-3 text-sm text-gray-500">
                                    {field.required ? (
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                        Required
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                        Optional
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-gray-500">{field.description || '-'}</td>
                                  <td className="px-4 py-3 text-sm text-gray-500">
                                    <div className="flex space-x-2">
                                      <button
                                        onClick={() => openEditOrderLineField(documentTypes.findIndex(t => t.id === editingType.id), fieldIndex)}
                                        className="text-blue-600 hover:text-blue-800"
                                      >
                                        Edit
                                      </button>
                                      <button
                                        onClick={() => deleteOrderLineField(documentTypes.findIndex(t => t.id === editingType.id), fieldIndex)}
                                        className="text-red-600 hover:text-red-800"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="text-center py-8 text-gray-500">
                          No order line fields defined yet. Click "Add Order Line Field" to get started.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <h3 className="mt-2 text-sm font-medium text-gray-900">No document type selected</h3>
                  <p className="mt-1 text-sm text-gray-500">Select a document type from the sidebar to view and edit its fields.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add Document Type Form */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">Add New Document Type</h3>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setNewTypeName('');
                  setNewTypeDescription('');
                  setNewTypeContainsOrderLines(false);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={addDocumentType} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Document Type Name
                </label>
                <input
                  type="text"
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Invoice, Contract, Report"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={newTypeDescription}
                  onChange={(e) => setNewTypeDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Describe what this document type is used for"
                  rows={3}
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="containsOrderLines"
                  checked={newTypeContainsOrderLines}
                  onChange={(e) => setNewTypeContainsOrderLines(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="containsOrderLines" className="ml-2 block text-sm text-gray-700">
                  This document type contains order lines
                </label>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setNewTypeName('');
                    setNewTypeDescription('');
                    setNewTypeContainsOrderLines(false);
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Add Document Type
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Document Type Modal */}
      {showEditDocumentType && editingDocumentType && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">Edit Document Type</h3>
              <button
                onClick={() => {
                  setShowEditDocumentType(false);
                  setEditingDocumentType(null);
                  setEditTypeName('');
                  setEditTypeDescription('');
                  setEditTypeContainsOrderLines(false);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={saveDocumentTypeEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Document Type Name
                </label>
                <input
                  type="text"
                  value={editTypeName}
                  onChange={(e) => setEditTypeName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Invoice, Contract, Report"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={editTypeDescription}
                  onChange={(e) => setEditTypeDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Describe what this document type is used for"
                  rows={3}
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="editContainsOrderLines"
                  checked={editTypeContainsOrderLines}
                  onChange={(e) => setEditTypeContainsOrderLines(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="editContainsOrderLines" className="ml-2 block text-sm text-gray-700">
                  This document type contains order lines
                </label>
              </div>

              <div className="flex justify-between pt-4">
                <button
                  type="button"
                  onClick={() => deleteDocumentType(editingDocumentType.id)}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  Delete Type
                </button>
                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditDocumentType(false);
                      setEditingDocumentType(null);
                      setEditTypeName('');
                      setEditTypeDescription('');
                      setEditTypeContainsOrderLines(false);
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Field Modal */}
      {showAddField && addingToTypeIndex !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">Add New Field</h3>
              <button
                onClick={() => {
                  setShowAddField(false);
                  setAddingToTypeIndex(null);
                  setNewField({ name: '', type: 'text', required: false, description: '' });
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={addNewField} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Field Name
                </label>
                <input
                  type="text"
                  value={newField.name}
                  onChange={(e) => setNewField({ ...newField, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., customer_name, amount, date"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Field Type
                </label>
                <select
                  value={newField.type}
                  onChange={(e) => setNewField({ ...newField, type: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                  <option value="email">Email</option>
                  <option value="url">URL</option>
                  <option value="boolean">Boolean</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={newField.description}
                  onChange={(e) => setNewField({ ...newField, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Describe what this field is used for"
                  rows={2}
                />
              </div>

              {/* Sample Values Section */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sample Values (for ML training)
                </label>
                <div className="space-y-2">
                  {newField.samples && newField.samples.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {newField.samples.map((sample, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800"
                        >
                          {sample}
                          <button
                            type="button"
                            onClick={() => removeSampleFromNewField(idx)}
                            className="ml-2 text-blue-600 hover:text-blue-800"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add sample value and press Enter"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const input = e.currentTarget;
                          addSampleToNewField(input.value);
                          input.value = '';
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                        if (input && input.value) {
                          addSampleToNewField(input.value);
                          input.value = '';
                        }
                      }}
                      className="px-4 py-2 text-sm bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200"
                    >
                      Add Sample
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">
                    Add example values to help train the ML model for better extraction accuracy
                  </p>
                </div>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="fieldRequired"
                  checked={newField.required}
                  onChange={(e) => setNewField({ ...newField, required: e.target.checked })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="fieldRequired" className="ml-2 block text-sm text-gray-700">
                  This field is required
                </label>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddField(false);
                    setAddingToTypeIndex(null);
                    setNewField({ name: '', type: 'text', required: false, description: '' });
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  Add Field
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Order Line Field Modal */}
      {showAddOrderLineField && addingToTypeIndex !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">Add New Order Line Field</h3>
              <button
                onClick={() => {
                  setShowAddOrderLineField(false);
                  setAddingToTypeIndex(null);
                  setNewOrderLineField({ name: '', type: 'text', required: false, description: '' });
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={addNewOrderLineField} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Field Name
                </label>
                <input
                  type="text"
                  value={newOrderLineField.name}
                  onChange={(e) => setNewOrderLineField({ ...newOrderLineField, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., product_name, quantity, unit_price"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Field Type
                </label>
                <select
                  value={newOrderLineField.type}
                  onChange={(e) => setNewOrderLineField({ ...newOrderLineField, type: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                  <option value="email">Email</option>
                  <option value="url">URL</option>
                  <option value="boolean">Boolean</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={newOrderLineField.description}
                  onChange={(e) => setNewOrderLineField({ ...newOrderLineField, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Describe what this field is used for"
                  rows={2}
                />
              </div>

              {/* Sample Values Section */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sample Values (for ML training)
                </label>
                <div className="space-y-2">
                  {newOrderLineField.samples && newOrderLineField.samples.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {newOrderLineField.samples.map((sample, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800"
                        >
                          {sample}
                          <button
                            type="button"
                            onClick={() => removeSampleFromNewOrderLineField(idx)}
                            className="ml-2 text-blue-600 hover:text-blue-800"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add sample value and press Enter"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const input = e.currentTarget;
                          addSampleToNewOrderLineField(input.value);
                          input.value = '';
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                        if (input && input.value) {
                          addSampleToNewOrderLineField(input.value);
                          input.value = '';
                        }
                      }}
                      className="px-4 py-2 text-sm bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200"
                    >
                      Add Sample
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">
                    Add example values to help train the ML model for better extraction accuracy
                  </p>
                </div>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="orderLineFieldRequired"
                  checked={newOrderLineField.required}
                  onChange={(e) => setNewOrderLineField({ ...newOrderLineField, required: e.target.checked })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="orderLineFieldRequired" className="ml-2 block text-sm text-gray-700">
                  This field is required
                </label>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddOrderLineField(false);
                    setAddingToTypeIndex(null);
                    setNewOrderLineField({ name: '', type: 'text', required: false, description: '' });
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-purple-600 border border-transparent rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  Add Order Line Field
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Field Modal */}
      {showEditField && editingFieldIndex !== null && editingTypeIndex !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">Edit Field</h3>
              <button
                onClick={() => {
                  setShowEditField(false);
                  setEditingFieldIndex(null);
                  setEditingTypeIndex(null);
                  setEditField({ name: '', type: 'text', required: false, description: '' });
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={saveFieldEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Field Name
                </label>
                <input
                  type="text"
                  value={editField.name}
                  onChange={(e) => setEditField({ ...editField, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., customer_name, amount, date"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Field Type
                </label>
                <select
                  value={editField.type}
                  onChange={(e) => setEditField({ ...editField, type: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                  <option value="email">Email</option>
                  <option value="url">URL</option>
                  <option value="boolean">Boolean</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={editField.description}
                  onChange={(e) => setEditField({ ...editField, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Describe what this field is used for"
                  rows={2}
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="editFieldRequired"
                  checked={editField.required}
                  onChange={(e) => setEditField({ ...editField, required: e.target.checked })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="editFieldRequired" className="ml-2 block text-sm text-gray-700">
                  This field is required
                </label>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditField(false);
                    setEditingFieldIndex(null);
                    setEditingTypeIndex(null);
                    setEditField({ name: '', type: 'text', required: false, description: '' });
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Order Line Field Modal */}
      {showEditOrderLineField && editingOrderLineField !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">Edit Order Line Field</h3>
              <button
                onClick={() => {
                  setShowEditOrderLineField(false);
                  setEditingOrderLineField(null);
                  setEditOrderLineField({ name: '', type: 'text', required: false, description: '' });
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={saveOrderLineFieldEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Field Name
                </label>
                <input
                  type="text"
                  value={editOrderLineField.name}
                  onChange={(e) => setEditOrderLineField({ ...editOrderLineField, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., product_name, quantity, unit_price"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Field Type
                </label>
                <select
                  value={editOrderLineField.type}
                  onChange={(e) => setEditOrderLineField({ ...editOrderLineField, type: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                  <option value="email">Email</option>
                  <option value="url">URL</option>
                  <option value="boolean">Boolean</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={editOrderLineField.description}
                  onChange={(e) => setEditOrderLineField({ ...editOrderLineField, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Describe what this field is used for"
                  rows={2}
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="editOrderLineFieldRequired"
                  checked={editOrderLineField.required}
                  onChange={(e) => setEditOrderLineField({ ...editOrderLineField, required: e.target.checked })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="editOrderLineFieldRequired" className="ml-2 block text-sm text-gray-700">
                  This field is required
                </label>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditOrderLineField(false);
                    setEditingOrderLineField(null);
                    setEditOrderLineField({ name: '', type: 'text', required: false, description: '' });
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-purple-600 border border-transparent rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
  }
  
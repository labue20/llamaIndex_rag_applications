const insertDocument = async (file, processingMode = 'fast') => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('filename_as_doc_id', 'true');
  formData.append('processing_mode', processingMode);

  try {
    const response = await fetch('http://localhost:5601/uploadFile', {
      mode: 'cors',
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const responseData = await response.json();
    return {
      success: true,
      data: responseData
    };
  } catch (error) {
    console.error('Error inserting document:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

export default insertDocument;

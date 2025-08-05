// API function to fetch full document content
const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://your-api-domain.com' 
  : 'http://localhost:5601';

export const fetchFullDocumentContent = async (docId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/getFullDocument/${docId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return {
      success: true,
      data: data
    };
  } catch (error) {
    console.error('Error fetching full document content:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

export default fetchFullDocumentContent;

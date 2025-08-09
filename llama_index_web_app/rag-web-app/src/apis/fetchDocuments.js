
const fetchDocuments = async () => {
  try {
    const response = await fetch('http://localhost:5601/getDocuments', { mode: 'cors' });

    if (!response.ok) {
      console.error('fetchDocuments: Response not ok, status:', response.status);
      return [];
    }

    const documentList = await response.json();
    return documentList;
  } catch (error) {
    console.error('fetchDocuments: Error during fetch:', error);
    return [];
  }
};

export default fetchDocuments;

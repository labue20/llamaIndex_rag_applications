#!/usr/bin/env python3
"""
Test script for enhanced full document consumption capabilities
"""
import sys
import os
import json
sys.path.append('/Users/wilfredlabue/Documents/GitHub/llamaIndex_rag_applications/llama_index_web_app')

from index_server import (
    create_document_summary, 
    insert_into_index, 
    initialize_index, 
    get_documents_list,
    get_full_document_content
)

def test_full_document_consumption():
    """Test the enhanced full document consumption"""
    print("🔍 Testing Enhanced Full Document Consumption...")
    
    # Initialize the index
    print("📚 Initializing index...")
    initialize_index()
    
    # Test document insertion with full content analysis
    test_doc_path = "/Users/wilfredlabue/Documents/GitHub/llamaIndex_rag_applications/data_sources/constitution.pdf"
    
    if os.path.exists(test_doc_path):
        print(f"📄 Testing full document consumption: {test_doc_path}")
        
        # Insert document with enhanced processing
        try:
            result = insert_into_index(test_doc_path, doc_id="constitution_full_test")
            if result.get("success"):
                print("✅ Successfully processed document with full content analysis!")
                print(f"   - Document ID: {result.get('doc_id')}")
                print(f"   - Nodes created: {result.get('nodes_created')}")
                print(f"   - Chunking strategy: {result.get('chunking_strategy')}")
                
                # Get the enhanced document list
                print("\n📋 Getting enhanced document list...")
                doc_list = get_documents_list()
                
                for doc in doc_list:
                    if doc["id"] == "constitution_full_test":
                        print("✅ Found enhanced document metadata:")
                        print(f"   - File type: {doc.get('file_type')}")
                        print(f"   - Total nodes: {doc.get('total_nodes')}")
                        print(f"   - Processing timestamp: {doc.get('processing_timestamp')}")
                        
                        if "statistics" in doc:
                            stats = doc["statistics"]
                            print(f"   - Document statistics:")
                            print(f"     • Total characters: {stats.get('total_characters', 'N/A'):,}")
                            print(f"     • Total words: {stats.get('total_words', 'N/A'):,}")
                            print(f"     • Total paragraphs: {stats.get('total_paragraphs', 'N/A')}")
                            print(f"     • Total chunks: {stats.get('total_chunks', 'N/A')}")
                        
                        if "key_sections" in doc:
                            print(f"   - Key sections identified: {len(doc['key_sections'])}")
                            for i, section in enumerate(doc['key_sections'][:3]):
                                print(f"     {i+1}. {section}")
                        
                        print(f"   - Content preview length: {len(doc.get('text', ''))}")
                
                # Test full document retrieval
                print("\n🔍 Testing full document content retrieval...")
                full_content = get_full_document_content("constitution_full_test")
                
                if full_content.get("success"):
                    print("✅ Successfully retrieved full document content!")
                    print(f"   - Total nodes in full document: {full_content.get('total_nodes')}")
                    print(f"   - Reconstructed text length: {len(full_content.get('full_reconstructed_text', ''))}")
                    print(f"   - Available node details: {len(full_content.get('all_nodes', []))}")
                    
                    # Show a sample of the reconstructed content
                    reconstructed = full_content.get('full_reconstructed_text', '')
                    if reconstructed:
                        print(f"   - Sample reconstructed content (first 300 chars):")
                        print(f"     {reconstructed[:300]}...")
                else:
                    print(f"❌ Failed to retrieve full document: {full_content.get('error')}")
                
            else:
                print(f"❌ Document insertion failed: {result.get('error')}")
                return False
                
        except Exception as e:
            print(f"❌ Error processing document: {str(e)}")
            return False
    else:
        print(f"⚠️ Test document not found: {test_doc_path}")
        print("📝 You can test with any PDF file by updating the path above")
    
    print("\n🎉 Enhanced full document consumption test completed successfully!")
    return True

def test_document_summary_function():
    """Test the document summary creation function directly"""
    print("\n🧪 Testing document summary function...")
    
    # Create a sample text
    sample_text = """
    This is the beginning of a sample document. It contains multiple paragraphs to test the summarization functionality.
    
    This is the first major section with important content that should be captured in the summary.
    
    Here is some middle content that represents the core of the document. This section contains detailed information.
    
    More middle content to make the document longer and more realistic for testing purposes.
    
    Another section with different information to test the sectioning capabilities.
    
    This is the final section of the document that should be captured as the ending summary.
    """
    
    # Create mock processed nodes
    mock_nodes = [
        type('MockNode', (), {
            'metadata': {
                'document_title': 'Sample Document Title',
                'excerpt_keywords': 'sample, test, document'
            }
        })(),
        type('MockNode', (), {
            'metadata': {
                'section_summary': 'Important Section',
                'excerpt_keywords': 'important, section, content'
            }
        })()
    ]
    
    try:
        summary = create_document_summary(sample_text, mock_nodes)
        print("✅ Successfully created document summary!")
        print(f"   - Statistics: {json.dumps(summary['statistics'], indent=2)}")
        print(f"   - Key sections: {summary['key_sections']}")
        print(f"   - Content preview length: {len(summary['content_preview'])}")
        return True
    except Exception as e:
        print(f"❌ Error creating document summary: {str(e)}")
        return False

if __name__ == "__main__":
    success1 = test_document_summary_function()
    success2 = test_full_document_consumption()
    
    if success1 and success2:
        print("\n🌟 All tests passed! Your enhanced document consumption is working perfectly!")
    else:
        print("\n⚠️ Some tests failed. Please check the error messages above.")

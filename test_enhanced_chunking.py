#!/usr/bin/env python3
"""
Test script for enhanced chunking capabilities
"""
import sys
import os
sys.path.append('/Users/wilfredlabue/Documents/GitHub/llamaIndex_rag_applications/llama_index_web_app')

from index_server import create_enhanced_chunking_pipeline, insert_into_index, initialize_index

def test_enhanced_chunking():
    """Test the enhanced chunking pipeline"""
    print("🧪 Testing Enhanced Chunking Pipeline...")
    
    # Initialize the index
    print("📚 Initializing index...")
    initialize_index()
    
    # Test the chunking pipeline creation
    print("⚙️ Creating enhanced chunking pipeline...")
    try:
        pipeline, sentence_splitter, token_splitter = create_enhanced_chunking_pipeline()
        print("✅ Successfully created chunking pipeline!")
        print(f"   - Pipeline transformations: {len(pipeline.transformations)}")
        print(f"   - Sentence splitter chunk size: {sentence_splitter.chunk_size}")
        print(f"   - Token splitter chunk size: {token_splitter.chunk_size}")
        
    except Exception as e:
        print(f"❌ Error creating pipeline: {str(e)}")
        return False
    
    # Test document insertion with enhanced chunking
    test_doc_path = "/Users/wilfredlabue/Documents/GitHub/llamaIndex_rag_applications/data_sources/constitution.pdf"
    
    if os.path.exists(test_doc_path):
        print(f"📄 Testing document insertion: {test_doc_path}")
        try:
            result = insert_into_index(test_doc_path, doc_id="constitution_test")
            if result.get("success"):
                print("✅ Successfully inserted document with enhanced chunking!")
                print(f"   - Document ID: {result.get('doc_id')}")
                print(f"   - Nodes created: {result.get('nodes_created')}")
                print(f"   - Chunking strategy: {result.get('chunking_strategy')}")
            else:
                print(f"❌ Document insertion failed: {result.get('error')}")
                return False
                
        except Exception as e:
            print(f"❌ Error inserting document: {str(e)}")
            return False
    else:
        print(f"⚠️ Test document not found: {test_doc_path}")
        print("📝 You can test with any PDF file by updating the path above")
    
    print("🎉 Enhanced chunking test completed successfully!")
    return True

if __name__ == "__main__":
    test_enhanced_chunking()

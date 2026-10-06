"""
Word to PDF Conversion Service

This service provides functionality to convert Word documents (.docx) to PDF format
using the docx2pdf library.
"""

import os
import logging
from pathlib import Path
from typing import Union, Optional
from docx2pdf import convert
import tempfile
import uuid

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class WordToPdfConverter:
    """
    A class to handle Word to PDF conversion operations
    """
    
    def __init__(self, output_dir: Optional[str] = None):
        """
        Initialize the converter
        
        Args:
            output_dir (str, optional): Directory to save converted PDFs. 
                                      If None, uses system temp directory.
        """
        self.output_dir = output_dir or tempfile.gettempdir()
        self.ensure_output_directory()
    
    def ensure_output_directory(self):
        """Ensure the output directory exists"""
        Path(self.output_dir).mkdir(parents=True, exist_ok=True)
    
    def convert_docx_to_pdf(self, 
                           input_path: Union[str, Path], 
                           output_path: Optional[Union[str, Path]] = None) -> str:
        """
        Convert a single Word document to PDF
        
        Args:
            input_path (Union[str, Path]): Path to the input .docx file
            output_path (Union[str, Path], optional): Path for the output PDF file.
                                                    If None, generates automatically.
        
        Returns:
            str: Path to the converted PDF file
            
        Raises:
            FileNotFoundError: If input file doesn't exist
            ValueError: If input file is not a .docx file
            Exception: If conversion fails
        """
        input_path = Path(input_path)
        
        # Validate input file
        if not input_path.exists():
            raise FileNotFoundError(f"Input file not found: {input_path}")
        
        if input_path.suffix.lower() != '.docx':
            raise ValueError(f"Input file must be a .docx file, got: {input_path.suffix}")
        
        # Generate output path if not provided
        if output_path is None:
            output_filename = input_path.stem + '.pdf'
            output_path = Path(self.output_dir) / output_filename
        else:
            output_path = Path(output_path)
        
        try:
            logger.info(f"Converting {input_path} to {output_path}")
            
            # Perform the conversion
            convert(str(input_path), str(output_path))
            
            if not output_path.exists():
                raise Exception("Conversion completed but output file not found")
            
            logger.info(f"Successfully converted to: {output_path}")
            return str(output_path)
            
        except Exception as e:
            logger.error(f"Conversion failed: {str(e)}")
            raise Exception(f"Failed to convert Word document to PDF: {str(e)}")
    
    def convert_multiple_docx_to_pdf(self, 
                                   input_directory: Union[str, Path],
                                   output_directory: Optional[Union[str, Path]] = None) -> list:
        """
        Convert multiple Word documents in a directory to PDF
        
        Args:
            input_directory (Union[str, Path]): Directory containing .docx files
            output_directory (Union[str, Path], optional): Directory for output PDFs
        
        Returns:
            list: List of dictionaries with conversion results
        """
        input_dir = Path(input_directory)
        output_dir = Path(output_directory) if output_directory else Path(self.output_dir)
        
        if not input_dir.exists():
            raise FileNotFoundError(f"Input directory not found: {input_dir}")
        
        output_dir.mkdir(parents=True, exist_ok=True)
        
        results = []
        docx_files = list(input_dir.glob("*.docx"))
        
        if not docx_files:
            logger.warning(f"No .docx files found in {input_dir}")
            return results
        
        for docx_file in docx_files:
            try:
                output_file = output_dir / (docx_file.stem + '.pdf')
                converted_path = self.convert_docx_to_pdf(docx_file, output_file)
                
                results.append({
                    'input_file': str(docx_file),
                    'output_file': converted_path,
                    'status': 'success'
                })
                
            except Exception as e:
                logger.error(f"Failed to convert {docx_file}: {str(e)}")
                results.append({
                    'input_file': str(docx_file),
                    'output_file': None,
                    'status': 'failed',
                    'error': str(e)
                })
        
        return results
    
    def get_file_info(self, file_path: Union[str, Path]) -> dict:
        """
        Get information about a file
        
        Args:
            file_path (Union[str, Path]): Path to the file
            
        Returns:
            dict: File information
        """
        file_path = Path(file_path)
        
        if not file_path.exists():
            return {'exists': False}
        
        stat = file_path.stat()
        return {
            'exists': True,
            'name': file_path.name,
            'size': stat.st_size,
            'size_mb': round(stat.st_size / (1024 * 1024), 2),
            'extension': file_path.suffix,
            'absolute_path': str(file_path.absolute())
        }


# Global converter instance for use in Flask routes
converter = WordToPdfConverter()


def main():
    """
    Main function for standalone usage
    """
    import argparse
    
    parser = argparse.ArgumentParser(description='Word to PDF Converter')
    parser.add_argument('--input', '-i', required=True, help='Input .docx file path')
    parser.add_argument('--output', '-o', help='Output PDF file path (optional)')
    
    args = parser.parse_args()
    
    # Command line conversion
    try:
        converter = WordToPdfConverter()
        output_path = converter.convert_docx_to_pdf(args.input, args.output)
        print(f"Successfully converted: {args.input} -> {output_path}")
    except Exception as e:
        print(f"Conversion failed: {str(e)}")
        exit(1)


if __name__ == '__main__':
    main()

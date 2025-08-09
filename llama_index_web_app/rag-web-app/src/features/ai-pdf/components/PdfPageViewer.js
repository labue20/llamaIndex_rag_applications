/**
 * PdfPageViewer
 * Renders a PDF file page-by-page using pdfjs-dist with pagination controls.
 */

import React, { useEffect, useRef, useState } from 'react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';

// Configure the PDF.js worker (uses the local module URL)
GlobalWorkerOptions.workerSrc = new URL(
	'pdfjs-dist/build/pdf.worker.min.mjs',
	import.meta.url
).toString();

const PdfPageViewer = ({ fileUrl, fileName, onStartChat, onGenerateSummary }) => {
	const canvasRef = useRef(null);
	const [pdfDoc, setPdfDoc] = useState(null);
	const [currentPage, setCurrentPage] = useState(1);
	const [numPages, setNumPages] = useState(0);
	const [isLoading, setIsLoading] = useState(true);
	const [pageLoading, setPageLoading] = useState(false);
	const [error, setError] = useState('');
	const [scale, setScale] = useState(1.25);

	// Load PDF document
	useEffect(() => {
		let cancelled = false;

		const loadPdf = async () => {
			if (!fileUrl) return;
			
			setIsLoading(true);
			setError('');

			try {
				console.log('Loading PDF from URL:', fileUrl);
				const doc = await getDocument({ url: fileUrl }).promise;
				if (cancelled) return;
				
				setPdfDoc(doc);
				setNumPages(doc.numPages);
				setCurrentPage(1);
				console.log('PDF loaded successfully, pages:', doc.numPages);
			} catch (e) {
				if (!cancelled) {
					setError('Failed to load PDF document.');
					console.error('PdfPageViewer error:', e);
				}
			} finally {
				if (!cancelled) setIsLoading(false);
			}
		};

		loadPdf();
		return () => {
			cancelled = true;
		};
	}, [fileUrl]);

	// Render current page
	useEffect(() => {
		if (!pdfDoc || !canvasRef.current) return;

		const renderPage = async () => {
			setPageLoading(true);
			try {
				const page = await pdfDoc.getPage(currentPage);
				const viewport = page.getViewport({ scale });
				const canvas = canvasRef.current;
				const context = canvas.getContext('2d');
				
				canvas.height = viewport.height;
				canvas.width = viewport.width;

				await page.render({ canvasContext: context, viewport }).promise;
			} catch (e) {
				console.error('Error rendering page:', e);
				setError('Failed to render page.');
			} finally {
				setPageLoading(false);
			}
		};

		renderPage();
	}, [pdfDoc, currentPage, scale]);

	const goToNextPage = () => {
		if (currentPage < numPages) {
			setCurrentPage(currentPage + 1);
		}
	};

	const goToPrevPage = () => {
		if (currentPage > 1) {
			setCurrentPage(currentPage - 1);
		}
	};

	const goToFirstPage = () => {
		setCurrentPage(1);
	};

	const goToLastPage = () => {
		setCurrentPage(numPages);
	};

	const handlePageInput = (e) => {
		const pageNum = parseInt(e.target.value, 10);
		if (pageNum >= 1 && pageNum <= numPages) {
			setCurrentPage(pageNum);
		}
	};

	const zoomIn = () => {
		setScale(prevScale => Math.min(prevScale + 0.25, 3));
	};

	const zoomOut = () => {
		setScale(prevScale => Math.max(prevScale - 0.25, 0.5));
	};

	const resetZoom = () => {
		setScale(1.25);
	};

	return (
		<div className="pdf-page-viewer">
			<div className="pdf-page-viewer__header">
				<div className="pdf-page-viewer__info">
					<div className="pdf-page-viewer__meta">
						<h3 className="pdf-page-viewer__name">{fileName || 'Selected PDF'}</h3>
						{numPages > 0 && (
							<div className="pdf-page-viewer__pages">{numPages} pages</div>
						)}
					</div>
				</div>
				
				{/* Zoom Controls */}
				{numPages > 0 && (
					<div className="pdf-page-viewer__zoom-controls">
						<button 
							className="pdf-page-viewer__btn pdf-page-viewer__btn--zoom"
							onClick={zoomOut}
							disabled={scale <= 0.5}
							title="Zoom Out"
						>
							-
						</button>
						<span className="pdf-page-viewer__zoom-level">
							{Math.round(scale * 100)}%
						</span>
						<button 
							className="pdf-page-viewer__btn pdf-page-viewer__btn--zoom"
							onClick={zoomIn}
							disabled={scale >= 3}
							title="Zoom In"
						>
							+
						</button>
						<button 
							className="pdf-page-viewer__btn pdf-page-viewer__btn--zoom"
							onClick={resetZoom}
							title="Reset Zoom"
						>
							⟲
						</button>
					</div>
				)}
			</div>

			{/* Navigation Controls */}
			{numPages > 0 && !isLoading && (
				<div className="pdf-page-viewer__navigation">
					<div className="pdf-page-viewer__nav-controls">
						<button 
							className="pdf-page-viewer__btn pdf-page-viewer__btn--nav"
							onClick={goToFirstPage}
							disabled={currentPage === 1}
							title="First Page"
						>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<path d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/>
							</svg>
						</button>
						<button 
							className="pdf-page-viewer__btn pdf-page-viewer__btn--nav"
							onClick={goToPrevPage}
							disabled={currentPage === 1}
							title="Previous Page"
						>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<path d="M15 18l-6-6 6-6"/>
							</svg>
						</button>
						
						<div className="pdf-page-viewer__page-info">
							<span>Page </span>
							<input 
								type="number"
								min="1"
								max={numPages}
								value={currentPage}
								onChange={handlePageInput}
								className="pdf-page-viewer__page-input"
								title="Enter page number"
							/>
							<span> of {numPages}</span>
						</div>
						
						<button 
							className="pdf-page-viewer__btn pdf-page-viewer__btn--nav"
							onClick={goToNextPage}
							disabled={currentPage === numPages}
							title="Next Page"
						>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<path d="M9 18l6-6-6-6"/>
							</svg>
						</button>
						<button 
							className="pdf-page-viewer__btn pdf-page-viewer__btn--nav"
							onClick={goToLastPage}
							disabled={currentPage === numPages}
							title="Last Page"
						>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<path d="M13 5l7 7-7 7M6 5l7 7-7 7"/>
							</svg>
						</button>
					</div>
				</div>
			)}

			{isLoading && (
				<div className="pdf-page-viewer__loading">
					<div className="pdf-page-viewer__loading-text">Loading PDF...</div>
				</div>
			)}

			{error && (
				<div className="pdf-page-viewer__error">⚠️ {error}</div>
			)}

			{/* PDF Content */}
			<div className="pdf-page-viewer__content">
				{pdfDoc && !isLoading && (
					<div className="pdf-page-viewer__page">
						{pageLoading && (
							<div className="pdf-page-viewer__page-loading">Loading page...</div>
						)}
						<canvas 
							ref={canvasRef}
							className="pdf-page-viewer__canvas"
							style={{ opacity: pageLoading ? 0.5 : 1 }}
						/>
					</div>
				)}
			</div>
		</div>
	);
};

export default PdfPageViewer;


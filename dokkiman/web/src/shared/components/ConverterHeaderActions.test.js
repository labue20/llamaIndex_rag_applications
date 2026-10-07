import { useRef, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ConverterHeaderActions from './ConverterHeaderActions';
import PdfToWordConverter from '../../features/pdf-to-word-converter/components/PdfToWordConverter';
import WordToPdfConverter from '../../features/word-to-pdf-converter/components/WordToPdfConverter';
import { mockFetch } from '../../test-utils/mockFetch';

// A converter page with its header toolbar, wired together as in App.js
const ConverterPage = ({ Converter, acceptedTypes }) => {
  const converterRef = useRef(null);
  const [status, setStatus] = useState({ hasFile: false, isBusy: false });
  return (
    <>
      <ConverterHeaderActions converterRef={converterRef} status={status} acceptedTypes={acceptedTypes} />
      <Converter ref={converterRef} onStatusChange={setStatus} />
    </>
  );
};

const docx = (name) => new File(['docx'], name, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
const pdf = (name) => new File(['%PDF'], name, { type: 'application/pdf' });

const chooseNewDocument = (file) =>
  fireEvent.change(screen.getByLabelText('New document'), { target: { files: [file] } });

const closeButton = () => screen.getByRole('button', { name: 'Close document' });

beforeEach(() => {
  mockFetch({});
  jest.spyOn(window, 'alert').mockImplementation(() => {});
});

describe('Word to PDF page', () => {
  const renderPage = () => render(<ConverterPage Converter={WordToPdfConverter} acceptedTypes='.docx' />);

  test('New document loads a file and Close document clears it', () => {
    renderPage();
    expect(closeButton()).toBeDisabled();
    expect(screen.getByLabelText('New document')).toHaveAttribute('accept', '.docx');

    chooseNewDocument(docx('letter.docx'));
    expect(screen.getByText('letter.docx')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Convert to PDF/ })).toBeInTheDocument();
    expect(closeButton()).toBeEnabled();

    fireEvent.click(closeButton());
    expect(screen.queryByText('letter.docx')).toBeNull();
    expect(screen.queryByRole('button', { name: /Convert to PDF/ })).toBeNull();
    expect(closeButton()).toBeDisabled();
  });

  test('New document replaces the current file', () => {
    renderPage();
    chooseNewDocument(docx('first.docx'));
    chooseNewDocument(docx('second.docx'));
    expect(screen.queryByText('first.docx')).toBeNull();
    expect(screen.getByText('second.docx')).toBeInTheDocument();
  });

  test('the same file can be chosen again after closing it', () => {
    renderPage();
    const file = docx('letter.docx');
    chooseNewDocument(file);
    fireEvent.click(closeButton());
    chooseNewDocument(file);
    expect(screen.getByText('letter.docx')).toBeInTheDocument();
  });

  test('other file types are refused', () => {
    renderPage();
    chooseNewDocument(pdf('report.pdf'));
    expect(window.alert).toHaveBeenCalledWith('Please select a Word document (.docx)');
    expect(screen.queryByText('report.pdf')).toBeNull();
  });

  test('both buttons are disabled while converting', async () => {
    global.fetch = jest.fn(() => new Promise(() => {})); // conversion never finishes
    renderPage();
    chooseNewDocument(docx('letter.docx'));

    fireEvent.click(screen.getByRole('button', { name: /Convert to PDF/ }));

    await waitFor(() => expect(closeButton()).toBeDisabled());
    expect(screen.getByLabelText('New document')).toBeDisabled();
  });
});

describe('PDF to Word page', () => {
  const renderPage = () => render(<ConverterPage Converter={PdfToWordConverter} acceptedTypes='.pdf' />);

  test('New document loads a PDF and Close document clears it', async () => {
    renderPage();
    expect(screen.getByLabelText('New document')).toHaveAttribute('accept', '.pdf');

    chooseNewDocument(pdf('report.pdf'));
    expect(await screen.findByText('report.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Convert to Word/ })).toBeInTheDocument();
    expect(closeButton()).toBeEnabled();

    fireEvent.click(closeButton());
    expect(screen.queryByText('report.pdf')).toBeNull();
    expect(closeButton()).toBeDisabled();
  });

  test('New document replaces the current PDF', async () => {
    renderPage();
    chooseNewDocument(pdf('first.pdf'));
    expect(await screen.findByText('first.pdf')).toBeInTheDocument();

    chooseNewDocument(pdf('second.pdf'));
    expect(await screen.findByText('second.pdf')).toBeInTheDocument();
    expect(screen.queryByText('first.pdf')).toBeNull();
  });

  test('other file types are refused', () => {
    renderPage();
    chooseNewDocument(docx('letter.docx'));
    expect(window.alert).toHaveBeenCalledWith('Please select a valid PDF file');
    expect(screen.queryByRole('button', { name: /Convert to Word/ })).toBeNull();
  });
});

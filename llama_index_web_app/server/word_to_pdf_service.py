"""
Word to PDF conversion using LibreOffice in headless mode.

LibreOffice runs without windows or dialogs, so conversions work unattended,
both on macOS and on Linux servers (where Microsoft Word isn't available).
"""

import atexit
import logging
import os
import shutil
import subprocess
import tempfile
import threading
from pathlib import Path
from typing import Optional, Union

logger = logging.getLogger(__name__)

# Seconds before a stuck conversion is killed
CONVERSION_TIMEOUT_SECONDS = int(os.environ.get("WORD_TO_PDF_TIMEOUT", "120"))

_MACOS_SOFFICE = "/Applications/LibreOffice.app/Contents/MacOS/soffice"

# LibreOffice won't run two instances on one user profile, so each server
# process gets its own profile and converts one document at a time.
_PROFILE_PREFIX = "libreoffice-profile-"
_PROFILE_DIR = Path(tempfile.gettempdir()) / f"{_PROFILE_PREFIX}{os.getpid()}"
_conversion_lock = threading.Lock()


def _process_is_running(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def remove_stale_profiles(temp_dir: Optional[Path] = None) -> int:
    """Delete LibreOffice profiles left by server processes that have exited
    (a killed process can't clean up after itself)."""
    removed = 0
    for profile in Path(temp_dir or tempfile.gettempdir()).glob(f"{_PROFILE_PREFIX}*"):
        pid = profile.name[len(_PROFILE_PREFIX):]
        if pid.isdigit() and int(pid) != os.getpid() and not _process_is_running(int(pid)):
            shutil.rmtree(profile, ignore_errors=True)
            removed += 1
    return removed


remove_stale_profiles()
atexit.register(shutil.rmtree, _PROFILE_DIR, ignore_errors=True)


class ConversionError(Exception):
    """A Word document could not be converted."""


def find_soffice() -> Optional[str]:
    """Path to LibreOffice's soffice program, or None if it isn't installed."""
    candidates = [
        os.environ.get("SOFFICE_PATH"),
        shutil.which("soffice"),
        shutil.which("libreoffice"),
        _MACOS_SOFFICE,
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return candidate
    return None


class WordToPdfConverter:
    """Converts .docx files to PDF with LibreOffice."""

    def convert_docx_to_pdf(self, input_path: Union[str, Path], output_path: Union[str, Path]) -> str:
        """Convert input_path (.docx) to a PDF at output_path and return its path."""
        input_path, output_path = Path(input_path), Path(output_path)
        if not input_path.exists():
            raise FileNotFoundError(f"Input file not found: {input_path}")
        if input_path.suffix.lower() != ".docx":
            raise ValueError(f"Input file must be a .docx file, got: {input_path.suffix}")

        soffice = find_soffice()
        if soffice is None:
            raise ConversionError(
                "LibreOffice is not installed on the server, so Word documents can't be converted."
            )

        # LibreOffice names the output after the input; write it to its own folder
        with tempfile.TemporaryDirectory(prefix="libreoffice-out-") as out_dir:
            command = [
                soffice,
                "--headless",
                "--norestore",
                "--nologo",
                "--nodefault",
                "--nolockcheck",
                f"-env:UserInstallation={_PROFILE_DIR.as_uri()}",
                "--convert-to", "pdf",
                "--outdir", out_dir,
                str(input_path),
            ]
            logger.info(f"Converting {input_path.name} to PDF with LibreOffice")
            try:
                with _conversion_lock:
                    result = subprocess.run(
                        command, capture_output=True, text=True, timeout=CONVERSION_TIMEOUT_SECONDS
                    )
            except subprocess.TimeoutExpired:
                raise ConversionError(
                    f"Conversion took longer than {CONVERSION_TIMEOUT_SECONDS} seconds and was stopped."
                )

            produced = Path(out_dir) / f"{input_path.stem}.pdf"
            if result.returncode != 0 or not produced.exists():
                logger.error(
                    f"LibreOffice failed (exit {result.returncode}): {result.stderr.strip() or result.stdout.strip()}"
                )
                raise ConversionError("The document could not be converted. It may be damaged or not a real .docx file.")

            output_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(produced), output_path)

        logger.info(f"Converted to {output_path.name}")
        return str(output_path)


converter = WordToPdfConverter()

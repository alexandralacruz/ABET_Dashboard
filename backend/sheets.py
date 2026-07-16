"""
Google Sheets data fetcher for ABET Dashboard.
Fetches student outcome data from one or more Google Sheets.
"""
import os
import logging
from typing import Optional
from pathlib import Path

from dotenv import load_dotenv
from google.oauth2 import service_account
from googleapiclient.discovery import build

load_dotenv()

logger = logging.getLogger(__name__)

SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]


class SheetsClient:
    """Client for fetching ABET data from Google Sheets."""

    def __init__(self, credentials_path: Optional[str] = None):
        creds_path = credentials_path or os.getenv(
            "GOOGLE_SHEETS_CREDENTIALS_FILE", "credentials.json"
        )
        # Resolve relative to the backend directory
        if not os.path.isabs(creds_path):
            creds_path = Path(__file__).parent / creds_path

        if not os.path.exists(creds_path):
            raise FileNotFoundError(
                f"Credentials file not found at {creds_path}. "
                "Place your Google service account JSON key there."
            )

        self.credentials = service_account.Credentials.from_service_account_file(
            str(creds_path), scopes=SCOPES
        )
        self.service = build("sheets", "v4", credentials=self.credentials)

    def get_sheet_data(
        self,
        spreadsheet_id: Optional[str] = None,
        range_name: Optional[str] = None,
    ) -> list[list[str]]:
        """
        Fetch data from a Google Sheet.

        Args:
            spreadsheet_id: The ID from the sheet URL.
            range_name: Sheet name and range, e.g. 'Sheet1!A1:BA100'.

        Returns:
            2D list of cell values (list of rows).
        """
        sheet_id = spreadsheet_id or os.getenv("SPREADSHEET_ID")
        if not sheet_id:
            raise ValueError("SPREADSHEET_ID not set in env or provided.")

        if range_name is None:
            range_name = "A1:BA200"

        result = (
            self.service.spreadsheets()
            .values()
            .get(spreadsheetId=sheet_id, range=range_name)
            .execute()
        )
        return result.get("values", [])

    def get_multiple_sheets(
        self,
        spreadsheet_id: Optional[str] = None,
        sheet_ranges: Optional[list[dict]] = None,
    ) -> dict:
        """
        Fetch data from multiple sheets/ranges.

        Args:
            spreadsheet_id: The spreadsheet ID.
            sheet_ranges: List of {"name": "label", "range": "Sheet1!A:BA"}.

        Returns:
            Dict with labels as keys and 2D lists as values.
        """
        sheet_id = spreadsheet_id or os.getenv("SPREADSHEET_ID")
        if not sheet_id:
            raise ValueError("SPREADSHEET_ID not set.")

        if sheet_ranges is None:
            # Default: fetch the first sheet
            metadata = (
                self.service.spreadsheets()
                .get(spreadsheetId=sheet_id)
                .execute()
            )
            first_sheet = metadata["sheets"][0]["properties"]["title"]
            sheet_ranges = [{"name": first_sheet, "range": f"'{first_sheet}'!A:BA"}]

        results = {}
        for sr in sheet_ranges:
            data = (
                self.service.spreadsheets()
                .values()
                .get(spreadsheetId=sheet_id, range=sr["range"])
                .execute()
            )
            results[sr["name"]] = data.get("values", [])
        return results


# Singleton
_client: Optional[SheetsClient] = None


def get_client() -> SheetsClient:
    global _client
    if _client is None:
        _client = SheetsClient()
    return _client

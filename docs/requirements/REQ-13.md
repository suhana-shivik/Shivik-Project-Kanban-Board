# REQ-13: Validate HSN code against GST slab on material create/edit

## Description

Materials already store both hsn and gst as free-text fields. Add a lookup table of valid HSN codes to GST percentage mappings, and validate/auto-fill the gst field server-side when hsn is entered.

## Status

- Status: approved
- Created by: Suhana Admin

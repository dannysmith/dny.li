# Scratchpad

## Next Tasks

### Admin UI Improvements

- [x] Move th URL creation form to the top of the page and remove the heading
- [x] Auto-focus the "URL to shortern" box on page load
- [x] Copy the new short URL to the clipboard on creation of a new shortURL
- [x] Give th UI some polish and make it feel a more modern and slick
- [x] Add a quick copy button to the URL cards

### Technical Improvements

- [x] Redirect GET requests to `/` to `https://danny.is`
- [x] Write simple, FAST automated tests to check the functionality works. These must run reliably in a local environment and properly tear down any seed data or stuff they create afterwards:
  - [x] All API Endpoints
  - [x] All admin endpoints
  - [x] `/` and `/all.json`
  - [x] Any unit tests which seem important to check
- [x] Review all code to ensure it's as simple, modern, performant and robust as possible.

### Simple Chrome Extension

When clicking the extension button in chrome, it should open the admin interface in a chrome sidePanel, populate the "URL to shortern" input with the currently open pages url and then try to form a sensible kebab-case slug from the current pages URL (and/or title) and pre-fill the slug input with that, but with the text selected for fast editing. When hitting save it should copy the full short URL to the clipboard.If it'snot possible to load the actual admin interface inside a chrome sidePanel, we can replicate the interface inside the extension and make calls to the admin AP instead. The list of all existing URLs can be got from the open `/all.json` endpoint for displaying the list.The code for the extension should be as simple as humanly possible to achieve the goal.

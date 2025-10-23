# Repository Guidelines

- Use 2 spaces for indentation in JavaScript and JSON files.
- Prefer CommonJS modules for Node.js scripts unless otherwise specified.
- Keep generated files clearly marked as such in their headers when possible.
- Update or regenerate derived artifacts (such as documentation or JSON summaries) when related source files change.

# userscript edits
- Update version in userscripts when change, patch, minor or major, depends on changes
- Run `npm run build` before commit

# Pull request naming
Create name using angular commit message format.
`feat:` and `fix:` are using in CHANGELOG.md. It's a release notes for developers. Name your PRs in a way that it's easy to understand what was changed. Forbidden to use `feat:` and `fix:` prefixes for chore tasks that don't add new features or fix bugs.

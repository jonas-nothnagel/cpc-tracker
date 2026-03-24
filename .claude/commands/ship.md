Create a PR for the current changes. Follow these steps exactly:

1. Run `git status` and `git diff --stat` to understand all changes
2. Create a new branch from the current branch with a descriptive name (e.g. `feat/short-description` or `fix/short-description`). Use `git checkout -b <branch-name>`
3. Stage all relevant changed files (be specific, don't use `git add -A`)
4. Write a concise commit message summarizing the "why" not the "what"
5. Push the branch with `git push -u origin <branch-name>`
6. Create a PR with `gh pr create` using:
   - A short title (under 70 chars)
   - A body with ## Summary (bullet points), ## Changes (key files), and ## Test plan
   - Request review from `$ARGUMENTS` if provided, otherwise skip reviewer assignment
7. Print the PR URL when done

Important:
- Never force push or amend commits
- Never commit .env files or credentials
- If the branch already exists, ask before overwriting

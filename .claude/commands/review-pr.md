Review a pull request and post the review as a comment on the PR.

If `$ARGUMENTS` is a PR number or URL, review that PR. Otherwise, review the current branch's open PR.

Steps:

1. Get the PR details: `gh pr view <pr> --json number,title,body,headRefName,baseRefName,files`
2. Get the full diff: `gh pr diff <pr>`
3. Read the key changed files to understand context
4. Analyze the changes for:
   - Correctness: bugs, logic errors, edge cases
   - Security: injection, data leaks, auth issues
   - Code quality: naming, structure, duplication
   - Completeness: does it match the PR description and intent?
   - Missing tests or documentation updates
5. Write a review summary with:
   - **Overview**: 1-2 sentence assessment
   - **What looks good**: things done well
   - **Suggestions**: specific, actionable feedback with file:line references
   - **Questions**: anything unclear about intent or approach
6. Post the review as a PR comment using `gh pr review <pr> --comment --body "<review>"`
   Use a HEREDOC for the body to preserve formatting.
7. If there are specific line-level comments, post them with `gh api` to the PR review endpoint.

Important:
- Be constructive and specific
- Reference file paths and line numbers
- Distinguish blocking issues from suggestions
- If the PR looks good, say so clearly and approve with `gh pr review <pr> --approve --body "<summary>"`
- Never add "Generated with Claude Code" or similar AI attribution to review comments

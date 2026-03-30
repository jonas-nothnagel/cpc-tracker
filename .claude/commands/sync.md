Sync main branch across remotes and update local.

Steps:
1. Stash any uncommitted changes if needed
2. `git checkout main`
3. `git pull origin main` — pull latest from origin (undp)
4. `git push old-origin main` — push to old upstream (vercel deployment)
5. Return to the previous branch if one was checked out
6. Pop stash if anything was stashed

Print a summary of what was synced.

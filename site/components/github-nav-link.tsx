import { GitHubIcon } from "@/components/github-icon";
import { GITHUB_INFRA_URL } from "@/lib/github";

export function GitHubNavLink() {
  return (
    <a
      className="inline-flex items-center gap-2 text-sm text-fd-muted-foreground transition-colors hover:text-fd-accent-foreground"
      href={GITHUB_INFRA_URL}
      rel="noopener noreferrer"
      target="_blank"
    >
      <GitHubIcon className="size-4" />
      Go to GitHub
    </a>
  );
}

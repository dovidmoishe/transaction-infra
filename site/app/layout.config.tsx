import { GitHubIcon } from "@/components/github-icon";
import { GitHubNavLink } from "@/components/github-nav-link";
import { GITHUB_INFRA_URL } from "@/lib/github";
import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export const baseOptions = {
  links: [
    {
      type: "custom",
      on: "nav",
      children: <GitHubNavLink />,
    },
    {
      type: "main",
      text: "GitHub Repository",
      url: GITHUB_INFRA_URL,
      external: true,
      on: "menu",
      icon: <GitHubIcon className="size-4" />,
    },
  ],
  nav: {
    title: "SlotPilot",
  },
  themeSwitch: {
    enabled: false,
  },
} satisfies BaseLayoutProps;

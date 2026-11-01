// The two pages: the picture (Jev forms what you type) and the colony (a
// world the ants forage on their own). A hash route, so the dev server and a
// static build need nothing extra.

export type Page = "picture" | "colony";

export default function Nav({ page }: { page: Page }) {
  const link = (to: Page, label: string) => (
    <a
      href={to === "colony" ? "#colony" : "#"}
      className={`rounded-md px-2.5 py-1 text-sm ${page === to ? "bg-accent-soft text-accent" : "text-fg-2 hover:bg-raised"}`}
      aria-current={page === to ? "page" : undefined}
    >
      {label}
    </a>
  );
  return (
    <nav className="flex items-center gap-1" aria-label="pages">
      {link("picture", "Picture")}
      {link("colony", "Colony")}
    </nav>
  );
}

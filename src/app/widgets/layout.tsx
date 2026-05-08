/**
 * Minimal layout for /widgets/* pages — no app chrome, no nav, no
 * dashboard providers. Overrides the dark `html, body` background from
 * globals.css so iframed widgets sit on whatever color the host page
 * uses (SharePoint, WordPress, etc.).
 *
 * No `!important` here — light-theme widgets get a transparent body via
 * source-order, and dark-theme widgets (e.g. cool club) can still set
 * their own body background in their inline <style> block.
 */
export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `html, body { background: transparent; color: inherit; }`,
        }}
      />
      {children}
    </>
  );
}

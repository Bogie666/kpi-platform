/**
 * Minimal layout for /widgets/* pages — no app chrome, no nav, no
 * dashboard providers. Renders into a transparent body so the widget
 * can sit on any background when iframed into SharePoint / WordPress.
 */
export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return <div style={{ background: 'transparent' }}>{children}</div>;
}

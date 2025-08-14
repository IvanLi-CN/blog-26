import Footer from "./Footer";
import Header from "./Header";

interface PageLayoutProps {
  children: React.ReactNode;
  className?: string;
  headerProps?: {
    isSticky?: boolean;
    showSearchBox?: boolean;
    showToggleTheme?: boolean;
    showRssFeed?: boolean;
  };
}

export default function PageLayout({
  children,
  className = "",
  headerProps = {},
}: PageLayoutProps) {
  return (
    <div className={`min-h-screen bg-base-100 ${className}`}>
      <Header
        isSticky={true}
        showSearchBox={true}
        showToggleTheme={true}
        showRssFeed={true}
        {...headerProps}
      />
      <main className="flex-grow">{children}</main>
      <Footer />
    </div>
  );
}

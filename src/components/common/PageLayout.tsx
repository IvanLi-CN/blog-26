import AmbientScene from "./AmbientScene";
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
    <div className={`nature-app-shell flex min-h-screen flex-col ${className}`}>
      <AmbientScene />
      <div className="nature-content-layer flex min-h-screen flex-col">
        <Header
          isSticky={true}
          showSearchBox={true}
          showToggleTheme={true}
          showRssFeed={true}
          {...headerProps}
        />
        <main className="nature-main">{children}</main>
        <Footer />
      </div>
    </div>
  );
}

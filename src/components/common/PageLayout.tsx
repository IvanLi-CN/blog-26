import Footer from "./Footer";
import Header from "./Header";

interface PageLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export default function PageLayout({ children, className = "" }: PageLayoutProps) {
  return (
    <div className={`min-h-screen bg-base-100 ${className}`}>
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

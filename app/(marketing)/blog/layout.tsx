import './blog-emerald.css';

export default function BlogLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="ff-blog">{children}</div>;
}

export default function Home() {
  return (
    <div className="min-h-screen bg-base-100">
      {/* Navigation */}
      <div className="navbar bg-base-100 shadow-lg">
        <div className="flex-1">
          <a className="btn btn-ghost text-xl">Ivan's Blog</a>
        </div>
        <div className="flex-none">
          <ul className="menu menu-horizontal px-1">
            <li><a>Home</a></li>
            <li><a>Blog</a></li>
            <li><a>About</a></li>
          </ul>
        </div>
      </div>

      {/* Hero Section */}
      <div className="hero bg-gradient-to-r from-primary to-secondary text-primary-content py-20">
        <div className="hero-content text-center">
          <div className="max-w-md">
            <h1 className="mb-5 text-5xl font-bold">Ivan's Blog</h1>
            <p className="mb-5">
              Welcome to the new Next.js version! Successfully migrated from Astro with beautiful daisyUI components.
            </p>
            <button className="btn btn-accent btn-lg">Get Started</button>
          </div>
        </div>
      </div>

      {/* Migration Status Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4">Migration Status</h2>
          <p className="text-lg text-base-content/70">From Astro to Next.js with daisyUI</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          <div className="card bg-base-100 shadow-xl border border-success/20">
            <div className="card-body items-center text-center">
              <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
              </div>
              <h3 className="card-title text-success">Infrastructure</h3>
              <p className="text-center">Next.js 15 + TypeScript + Tailwind CSS + daisyUI</p>
              <div className="badge badge-success">Complete</div>
            </div>
          </div>

          <div className="card bg-base-100 shadow-xl border border-success/20">
            <div className="card-body items-center text-center">
              <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"></path>
                </svg>
              </div>
              <h3 className="card-title text-success">Database</h3>
              <p className="text-center">Drizzle ORM + SQLite schema migrated</p>
              <div className="badge badge-success">Complete</div>
            </div>
          </div>

          <div className="card bg-base-100 shadow-xl border border-warning/20">
            <div className="card-body items-center text-center">
              <div className="w-16 h-16 bg-warning/10 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4"></path>
                </svg>
              </div>
              <h3 className="card-title text-warning">Components</h3>
              <p className="text-center">React components migration in progress</p>
              <div className="badge badge-warning">In Progress</div>
            </div>
          </div>
        </div>
      </div>

      {/* daisyUI Components Showcase */}
      <div className="bg-base-200 py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold mb-4">daisyUI Components Showcase</h2>
            <p className="text-lg text-base-content/70">Interactive component library demonstration</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Buttons Section */}
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h3 className="card-title text-2xl mb-6">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.121 2.122"></path>
                  </svg>
                  Interactive Buttons
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <button className="btn btn-primary">Primary</button>
                  <button className="btn btn-secondary">Secondary</button>
                  <button className="btn btn-accent">Accent</button>
                  <button className="btn btn-info">Info</button>
                  <button className="btn btn-success">Success</button>
                  <button className="btn btn-warning">Warning</button>
                  <button className="btn btn-error">Error</button>
                  <button className="btn btn-ghost">Ghost</button>
                  <button className="btn btn-outline">Outline</button>
                </div>
              </div>
            </div>

            {/* Alerts & Notifications */}
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h3 className="card-title text-2xl mb-6">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-5 5v-5zM4 19h6v-6H4v6zM16 3h5v5h-5V3zM4 3h6v6H4V3z"></path>
                  </svg>
                  Alerts & Notifications
                </h3>
                <div className="space-y-4">
                  <div className="alert alert-info">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    <span>Migration is progressing well!</span>
                  </div>
                  <div className="alert alert-success">
                    <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Basic setup completed!</span>
                  </div>
                  <div className="alert alert-warning">
                    <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <span>Component migration in progress</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Form Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Form Elements */}
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h3 className="card-title text-2xl mb-6">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                </svg>
                Interactive Forms
              </h3>
              <div className="space-y-6">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Your message</span>
                  </label>
                  <input type="text" placeholder="Type something amazing..." className="input input-bordered w-full" />
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Choose theme</span>
                  </label>
                  <select className="select select-bordered w-full">
                    <option disabled selected>Pick your favorite theme</option>
                    <option>Light</option>
                    <option>Dark</option>
                    <option>Cupcake</option>
                    <option>Bumblebee</option>
                    <option>Emerald</option>
                    <option>Corporate</option>
                  </select>
                </div>

                <div className="space-y-4">
                  <div className="form-control">
                    <label className="label cursor-pointer">
                      <span className="label-text">Enable notifications</span>
                      <input type="checkbox" className="toggle toggle-primary" />
                    </label>
                  </div>
                  <div className="form-control">
                    <label className="label cursor-pointer">
                      <span className="label-text">Dark mode</span>
                      <input type="checkbox" className="toggle toggle-secondary" />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Progress & Stats */}
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h3 className="card-title text-2xl mb-6">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                </svg>
                Migration Progress
              </h3>
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-medium">Infrastructure Setup</span>
                    <span className="text-success font-bold">100%</span>
                  </div>
                  <progress className="progress progress-success w-full" value="100" max="100"></progress>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-medium">Components Migration</span>
                    <span className="text-warning font-bold">25%</span>
                  </div>
                  <progress className="progress progress-warning w-full" value="25" max="100"></progress>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-medium">daisyUI Integration</span>
                    <span className="text-info font-bold">95%</span>
                  </div>
                  <progress className="progress progress-info w-full" value="95" max="100"></progress>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Advanced Components Section */}
      <div className="bg-base-200 py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold mb-4">Advanced Components</h2>
            <p className="text-lg text-base-content/70">Interactive modals, tabs, and more</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Modal Demo */}
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h3 className="card-title">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
                  </svg>
                  Interactive Modal
                </h3>
                <p>Click the button to open a beautiful modal dialog</p>
                <div className="card-actions justify-end">
                  <label htmlFor="my-modal" className="btn btn-primary">Open Modal</label>
                </div>
              </div>
            </div>

            {/* Tabs Demo */}
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h3 className="card-title">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
                  </svg>
                  Navigation Tabs
                </h3>
                <div className="tabs tabs-boxed">
                  <a className="tab tab-active">Home</a>
                  <a className="tab">Blog</a>
                  <a className="tab">About</a>
                </div>
              </div>
            </div>

            {/* Badge Demo */}
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h3 className="card-title">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"></path>
                  </svg>
                  Status Badges
                </h3>
                <div className="flex flex-wrap gap-2">
                  <div className="badge badge-primary">Primary</div>
                  <div className="badge badge-secondary">Secondary</div>
                  <div className="badge badge-accent">Accent</div>
                  <div className="badge badge-info">Info</div>
                  <div className="badge badge-success">Success</div>
                  <div className="badge badge-warning">Warning</div>
                  <div className="badge badge-error">Error</div>
                  <div className="badge badge-ghost">Ghost</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Statistics Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="stats shadow w-full">
          <div className="stat">
            <div className="stat-figure text-primary">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-8 h-8 stroke-current">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
              </svg>
            </div>
            <div className="stat-title">Total Files Migrated</div>
            <div className="stat-value text-primary">441</div>
            <div className="stat-desc">From Astro to Next.js</div>
          </div>

          <div className="stat">
            <div className="stat-figure text-secondary">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-8 h-8 stroke-current">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
              </svg>
            </div>
            <div className="stat-title">Dependencies Installed</div>
            <div className="stat-value text-secondary">20+</div>
            <div className="stat-desc">Core packages ready</div>
          </div>

          <div className="stat">
            <div className="stat-figure text-accent">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-8 h-8 stroke-current">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4"></path>
              </svg>
            </div>
            <div className="stat-title">Migration Progress</div>
            <div className="stat-value text-accent">Phase 1</div>
            <div className="stat-desc">Infrastructure Complete</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="footer footer-center p-10 bg-base-200 text-base-content">
        <div>
          <div className="grid grid-flow-col gap-4">
            <a className="link link-hover">About</a>
            <a className="link link-hover">Contact</a>
            <a className="link link-hover">Blog</a>
            <a className="link link-hover">Projects</a>
          </div>
          <div>
            <p>Copyright © 2024 - Ivan's Blog. Built with Next.js 15 + daisyUI</p>
          </div>
        </div>
      </footer>

      {/* Modal */}
      <input type="checkbox" id="my-modal" className="modal-toggle" />
      <div className="modal">
        <div className="modal-box">
          <h3 className="font-bold text-lg">🎉 daisyUI Modal Demo!</h3>
          <p className="py-4">
            This is a beautiful modal powered by daisyUI! You can put any content here - forms, images, videos, or any other components.
          </p>
          <div className="py-4">
            <div className="alert alert-info">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <span>Modal is working perfectly with daisyUI!</span>
            </div>
          </div>
          <div className="modal-action">
            <label htmlFor="my-modal" className="btn btn-primary">Awesome!</label>
            <label htmlFor="my-modal" className="btn btn-ghost">Close</label>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-base-200">
      {/* Hero Section with daisyUI */}
      <div className="hero min-h-screen bg-gradient-to-r from-primary to-secondary">
        <div className="hero-content text-center text-primary-content">
          <div className="max-w-md">
            <h1 className="mb-5 text-5xl font-bold">Ivan's Blog</h1>
            <p className="mb-5">
              Welcome to the new Next.js version! Successfully migrated from Astro with daisyUI components.
            </p>
            <button className="btn btn-accent btn-lg">Get Started</button>
          </div>
        </div>
      </div>

      {/* Migration Status Section with daisyUI Cards */}
      <div className="container mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">Migration Status</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Status Cards using daisyUI */}
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h3 className="card-title text-success">✅ Infrastructure</h3>
              <p>Next.js 15 + TypeScript + Tailwind CSS + daisyUI setup complete</p>
              <div className="card-actions justify-end">
                <div className="badge badge-success">Complete</div>
              </div>
            </div>
          </div>

          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h3 className="card-title text-success">✅ Database</h3>
              <p>Drizzle ORM + SQLite schema migrated</p>
              <div className="card-actions justify-end">
                <div className="badge badge-success">Complete</div>
              </div>
            </div>
          </div>

          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h3 className="card-title text-warning">🔄 Components</h3>
              <p>React components migration in progress</p>
              <div className="card-actions justify-end">
                <div className="badge badge-warning">In Progress</div>
              </div>
            </div>
          </div>
        </div>

        {/* daisyUI Components Demo */}
        <div className="mt-16">
          <h2 className="text-3xl font-bold text-center mb-12">daisyUI Components Demo</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* daisyUI Buttons */}
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h3 className="card-title">Buttons</h3>
                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-primary">Primary</button>
                  <button className="btn btn-secondary">Secondary</button>
                  <button className="btn btn-accent">Accent</button>
                  <button className="btn btn-ghost">Ghost</button>
                  <button className="btn btn-outline">Outline</button>
                  <button className="btn btn-info">Info</button>
                  <button className="btn btn-success">Success</button>
                  <button className="btn btn-warning">Warning</button>
                  <button className="btn btn-error">Error</button>
                </div>
              </div>
            </div>

            {/* daisyUI Alerts */}
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h3 className="card-title">Alerts</h3>
                <div className="space-y-3">
                  <div className="alert alert-info">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    <span>Migration is progressing well!</span>
                  </div>
                  <div className="alert alert-success">
                    <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <span>Basic setup completed!</span>
                  </div>
                  <div className="alert alert-warning">
                    <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                    <span>Component migration in progress</span>
                  </div>
                </div>
              </div>
            </div>

            {/* daisyUI Form Elements */}
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h3 className="card-title">Form Elements</h3>
                <div className="space-y-4">
                  <input type="text" placeholder="Type here" className="input input-bordered w-full" />
                  <select className="select select-bordered w-full">
                    <option disabled selected>Pick your favorite theme</option>
                    <option>Light</option>
                    <option>Dark</option>
                    <option>Cupcake</option>
                    <option>Bumblebee</option>
                    <option>Emerald</option>
                    <option>Corporate</option>
                  </select>
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

            {/* daisyUI Progress */}
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h3 className="card-title">Progress</h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Infrastructure</span>
                      <span>100%</span>
                    </div>
                    <progress className="progress progress-primary w-full" value="100" max="100"></progress>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Components Migration</span>
                      <span>25%</span>
                    </div>
                    <progress className="progress progress-warning w-full" value="25" max="100"></progress>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>daisyUI Integration</span>
                      <span>90%</span>
                    </div>
                    <progress className="progress progress-success w-full" value="90" max="100"></progress>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Additional daisyUI Components */}
        <div className="mt-16">
          <h2 className="text-3xl font-bold text-center mb-12">More daisyUI Components</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Modal Demo */}
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h3 className="card-title">Modal</h3>
                <p>Click the button to open modal</p>
                <div className="card-actions justify-end">
                  <label htmlFor="my-modal" className="btn btn-primary">Open Modal</label>
                </div>
              </div>
            </div>

            {/* Tabs Demo */}
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h3 className="card-title">Tabs</h3>
                <div className="tabs tabs-boxed">
                  <a className="tab tab-active">Tab 1</a>
                  <a className="tab">Tab 2</a>
                  <a className="tab">Tab 3</a>
                </div>
              </div>
            </div>

            {/* Badge Demo */}
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h3 className="card-title">Badges</h3>
                <div className="flex flex-wrap gap-2">
                  <div className="badge badge-primary">Primary</div>
                  <div className="badge badge-secondary">Secondary</div>
                  <div className="badge badge-accent">Accent</div>
                  <div className="badge badge-ghost">Ghost</div>
                  <div className="badge badge-info">Info</div>
                  <div className="badge badge-success">Success</div>
                  <div className="badge badge-warning">Warning</div>
                  <div className="badge badge-error">Error</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* daisyUI Stats */}
        <div className="stats shadow w-full mt-16">
          <div className="stat">
            <div className="stat-figure text-primary">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-8 h-8 stroke-current"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>
            </div>
            <div className="stat-title">Total Files Migrated</div>
            <div className="stat-value text-primary">441</div>
            <div className="stat-desc">From Astro to Next.js</div>
          </div>

          <div className="stat">
            <div className="stat-figure text-secondary">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-8 h-8 stroke-current"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            </div>
            <div className="stat-title">Dependencies Installed</div>
            <div className="stat-value text-secondary">20+</div>
            <div className="stat-desc">Core packages ready</div>
          </div>

          <div className="stat">
            <div className="stat-figure text-accent">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-8 h-8 stroke-current"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4"></path></svg>
            </div>
            <div className="stat-title">Migration Progress</div>
            <div className="stat-value text-accent">Phase 1</div>
            <div className="stat-desc">Infrastructure Complete</div>
          </div>
        </div>

        {/* Modal */}
        <input type="checkbox" id="my-modal" className="modal-toggle" />
        <div className="modal">
          <div className="modal-box">
            <h3 className="font-bold text-lg">daisyUI Modal Demo!</h3>
            <p className="py-4">This is a beautiful modal powered by daisyUI. You can put any content here!</p>
            <div className="modal-action">
              <label htmlFor="my-modal" className="btn">Close</label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

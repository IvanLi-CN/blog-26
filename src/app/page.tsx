export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white">
        <div className="container mx-auto px-4 py-24 text-center">
          <h1 className="text-5xl font-bold mb-6">Ivan's Blog</h1>
          <p className="text-xl mb-8 max-w-2xl mx-auto">
            Welcome to the new Next.js version! Successfully migrated from Astro with modern tech stack.
          </p>
          <button className="bg-white text-blue-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors">
            Get Started
          </button>
        </div>
      </div>

      {/* Migration Status Section */}
      <div className="container mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center mb-12 text-gray-800">Migration Status</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Status Cards */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-xl font-semibold text-green-600 mb-3">✅ Infrastructure</h3>
            <p className="text-gray-600 mb-4">Next.js 15 + TypeScript + Tailwind CSS setup complete</p>
            <span className="inline-block bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
              Complete
            </span>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-xl font-semibold text-green-600 mb-3">✅ Database</h3>
            <p className="text-gray-600 mb-4">Drizzle ORM + SQLite schema migrated</p>
            <span className="inline-block bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
              Complete
            </span>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-xl font-semibold text-yellow-600 mb-3">🔄 Components</h3>
            <p className="text-gray-600 mb-4">React components migration in progress</p>
            <span className="inline-block bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-medium">
              In Progress
            </span>
          </div>
        </div>

        {/* Tailwind CSS Demo */}
        <div className="mt-16">
          <h2 className="text-3xl font-bold text-center mb-12 text-gray-800">Tailwind CSS Components Demo</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Buttons */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-xl font-semibold mb-4">Buttons</h3>
              <div className="flex flex-wrap gap-3">
                <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors">
                  Primary
                </button>
                <button className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 transition-colors">
                  Secondary
                </button>
                <button className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition-colors">
                  Success
                </button>
                <button className="border border-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-50 transition-colors">
                  Outline
                </button>
              </div>
            </div>

            {/* Alerts */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-xl font-semibold mb-4">Alerts</h3>
              <div className="space-y-3">
                <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded">
                  <strong>Info:</strong> Migration is progressing well!
                </div>
                <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded">
                  <strong>Success:</strong> Basic setup completed!
                </div>
              </div>
            </div>

            {/* Form Elements */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-xl font-semibold mb-4">Form Elements</h3>
              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="Type here"
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <select className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option>Pick your favorite theme</option>
                  <option>Light</option>
                  <option>Dark</option>
                </select>
                <label className="flex items-center space-x-3">
                  <input type="checkbox" className="form-checkbox h-5 w-5 text-blue-600" />
                  <span className="text-gray-700">Enable notifications</span>
                </label>
              </div>
            </div>

            {/* Progress */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-xl font-semibold mb-4">Progress</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm text-gray-600 mb-1">
                    <span>Infrastructure</span>
                    <span>100%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-blue-600 h-2 rounded-full" style={{ width: '100%' }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm text-gray-600 mb-1">
                    <span>Components Migration</span>
                    <span>25%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-yellow-500 h-2 rounded-full" style={{ width: '25%' }}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="bg-white rounded-lg shadow-lg p-8 mt-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-3xl font-bold text-blue-600 mb-2">441</div>
              <div className="text-gray-600">Total Files Migrated</div>
              <div className="text-sm text-gray-500">From Astro to Next.js</div>
            </div>

            <div>
              <div className="text-3xl font-bold text-green-600 mb-2">20+</div>
              <div className="text-gray-600">Dependencies Installed</div>
              <div className="text-sm text-gray-500">Core packages ready</div>
            </div>

            <div>
              <div className="text-3xl font-bold text-purple-600 mb-2">Phase 1</div>
              <div className="text-gray-600">Migration Progress</div>
              <div className="text-sm text-gray-500">Infrastructure Complete</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

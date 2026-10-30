import { useState } from 'react'
import './App.css'

function App() {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')
  const [showForm, setShowForm] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [defaultStatus, setDefaultStatus] = useState('Lost')

  const [items, setItems] = useState([
    {
      name: 'Black Wallet',
      category: 'Accessories',
      location: 'Library',
      status: 'Lost',
      icon: '👛',
      description: 'Black wallet lost in the library.',
      image: ''
    },
    {
      name: 'Blue Water Bottle',
      category: 'Accessories',
      location: 'Canteen',
      status: 'Found',
      icon: '🧴',
      description: 'Blue water bottle found in the canteen.',
      image: ''
    },
    {
      name: 'Scientific Calculator',
      category: 'Electronics',
      location: 'Block A',
      status: 'Found',
      icon: '🧮',
      description: 'Scientific calculator found near Block A.',
      image: ''
    },
  ])

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      `${item.name} ${item.category} ${item.location}`
        .toLowerCase()
        .includes(search.toLowerCase())

    const matchesFilter =
      filter === 'All' || item.status === filter

    return matchesSearch && matchesFilter
  })

  const openReportForm = (status) => {
    setDefaultStatus(status)
    setShowForm(true)
  }

  const handleReportSubmit = (e) => {
    e.preventDefault()

    const data = new FormData(e.currentTarget)
    const status = data.get('status')
    const category = data.get('category')
    const imageFile = data.get('image')

    const newItem = {
      name: data.get('name'),
      category,
      location: data.get('location'),
      description: data.get('description'),
      status,
      icon: category === 'Electronics' ? '💻'
        : category === 'Books' ? '📚'
        : category === 'Clothing' ? '👕'
        : category === 'Accessories' ? '🎒'
        : '📦',
      image: imageFile?.size > 0
        ? URL.createObjectURL(imageFile)
        : '',
    }

    setItems(previousItems => [newItem, ...previousItems])
    setShowForm(false)
    e.currentTarget.reset()
    setDefaultStatus('Lost')

    alert('Item reported successfully!')
  }

  return (
    <div className="app">

      {/* REPORT ITEM POPUP */}
      {showForm && (
        <div className="modal-overlay">
          <div className="report-modal">
            <button
              className="close-btn"
              onClick={() => setShowForm(false)}
            >
              ×
            </button>

            <h2>Report an Item</h2>
            <p>Help reunite lost belongings with their owners.</p>

            <form onSubmit={handleReportSubmit}>
              <label>Report Type</label>
              <select
                name="status"
                value={defaultStatus}
                onChange={(e) => setDefaultStatus(e.target.value)}
                required
              >
                <option value="Lost">I Lost Something</option>
                <option value="Found">I Found Something</option>
              </select>

              <label>Item Name</label>
              <input
                name="name"
                type="text"
                placeholder="e.g. Black Wallet"
                required
              />

              <label>Upload Item Photo</label>
              <input
                type="file"
                name="image"
                accept="image/*"
              />

              <label>Category</label>
              <select name="category" required>
                <option value="">Select category</option>
                <option>Electronics</option>
                <option>Accessories</option>
                <option>Books</option>
                <option>Clothing</option>
                <option>Other</option>
              </select>

              <label>Location</label>
              <input
                name="location"
                type="text"
                placeholder="Where was it lost or found?"
                required
              />

              <label>Description</label>
              <textarea
                name="description"
                placeholder="Describe the item..."
                required
              />

              <button type="submit" className="submit-btn">
                Submit Report
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ITEM DETAILS POPUP */}
      {selectedItem && (
        <div className="modal-overlay">
          <div className="report-modal">
            <button
              className="close-btn"
              onClick={() => setSelectedItem(null)}
            >
              ×
            </button>

            <h2>{selectedItem.icon} {selectedItem.name}</h2>

            <p><strong>Status:</strong> {selectedItem.status}</p>
            <p><strong>Category:</strong> {selectedItem.category}</p>
            <p><strong>Location:</strong> {selectedItem.location}</p>

            <p>
              <strong>Description:</strong>{' '}
              {selectedItem.description || 'No description provided.'}
            </p>

            {selectedItem.image && (
              <img
                src={selectedItem.image}
                alt={selectedItem.name}
                className="item-photo"
                style={{ width: '100%', height: 'auto' }}
              />
            )}

            {selectedItem.status === 'Found' && (
              <button
                className="submit-btn"
                onClick={() => alert('Your claim request has been submitted!')}
              >
                Claim This Item
              </button>
            )}
          </div>
        </div>
      )}

      {/* NAVBAR */}
      <header className="navbar">
        <h2 className="logo">Find<span>It.</span></h2>

        <nav>
          <a href="#home">Home</a>
          <a href="#items">Browse Items</a>
          <a href="#how">How It Works</a>
        </nav>

        <button
          className="report-btn"
          onClick={() => openReportForm('Lost')}
        >
          + Report Item
        </button>
      </header>

      <main>

        {/* HERO SECTION */}
        <section className="hero" id="home">
          <p className="tagline">YOUR CAMPUS. YOUR COMMUNITY.</p>

          <h1>
            Lost something?<br />
            <span>Let's find it.</span>
          </h1>

          <p className="hero-text">
            A smarter way to reconnect lost belongings with their owners.
            Search, report, and help make our campus a better place.
          </p>

          <div className="search-box">
            <input
              type="text"
              placeholder="Search for lost or found items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button>Search</button>
          </div>

          <div className="hero-actions">
            <button onClick={() => openReportForm('Lost')}>
              I Lost Something
            </button>

            <button onClick={() => openReportForm('Found')}>
              I Found Something
            </button>
          </div>
        </section>

        {/* ITEMS SECTION */}
        <section className="items-section" id="items">
          <div className="section-heading">
            <div>
              <p className="tagline">CAMPUS COMMUNITY</p>
              <h2>Recently Reported Items</h2>
            </div>

            <span>{filteredItems.length} items</span>
          </div>

          <div className="filter-controls">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="filter-select"
            >
              <option value="All">All Items</option>
              <option value="Lost">Lost Items</option>
              <option value="Found">Found Items</option>
            </select>
          </div>

          <div className="items-grid">
            {filteredItems.length > 0 ? (
              filteredItems.map((item, index) => (
                <article className="item-card" key={index}>

                  <div className="item-icon">
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.name}
                        className="item-photo"
                      />
                    ) : (
                      item.icon
                    )}
                  </div>

                  <span className={`status ${item.status.toLowerCase()}`}>
                    {item.status}
                  </span>

                  <h3>{item.name}</h3>
                  <p>{item.category}</p>
                  <p className="location">📍 {item.location}</p>

                  <button onClick={() => setSelectedItem(item)}>
                    View Details →
                  </button>

                </article>
              ))
            ) : (
              <p>No matching items found. Try another search.</p>
            )}
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="how-section" id="how">
          <p className="tagline">SIMPLE AND EASY</p>
          <h2>How FindIt Works</h2>

          <div className="steps">
            <div>
              <span>01</span>
              <h3>Report</h3>
              <p>Report an item you lost or found.</p>
            </div>

            <div>
              <span>02</span>
              <h3>Discover</h3>
              <p>Search and find possible matches.</p>
            </div>

            <div>
              <span>03</span>
              <h3>Reconnect</h3>
              <p>Connect with the owner and return the item.</p>
            </div>
          </div>
        </section>

      </main>

      {/* FOOTER */}
      <footer>
        <h2 className="logo">Find<span>It.</span></h2>
        <p>Helping campus belongings find their way home.</p>
        <p>© 2026 FindIt. College Lost & Found Platform.</p>
      </footer>

    </div>
  )
}

export default App

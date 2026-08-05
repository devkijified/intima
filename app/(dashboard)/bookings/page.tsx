export default function BookingsPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">My Bookings</h1>
      <p className="text-gray-600">Your bookings will appear here.</p>
      
      <div className="mt-8 rounded-lg border border-gray-200 bg-white p-8 text-center">
        <p className="text-gray-500">No bookings yet</p>
        <p className="text-sm text-gray-400 mt-1">Browse models to make your first booking</p>
      </div>
    </div>
  )
}

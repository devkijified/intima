export default function ProfilePage() {
  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">My Profile</h1>
      <p className="text-gray-600">Manage your profile settings here.</p>
      
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900">Personal Information</h2>
          <p className="text-sm text-gray-500 mt-2">Update your personal details</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900">Account Settings</h2>
          <p className="text-sm text-gray-500 mt-2">Manage your account preferences</p>
        </div>
      </div>
    </div>
  )
}

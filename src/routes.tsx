import ProtectedAdminRoute from "./components/ProtectedAdminRoute";

// In your routes configuration
{
  path: "/admin",
  element: (
    <ProtectedAdminRoute>
      <AdminPage />
    </ProtectedAdminRoute>
  )
} 
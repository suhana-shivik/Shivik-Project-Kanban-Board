import { useMemo, useState } from "react";
import { MaterialPage } from "../presentation/pages/materials/MaterialPage";
import { UsersPage } from "../presentation/pages/users/UsersPage";
import { LoginPage } from "../presentation/pages/auth/LoginPage";
import { useAuth } from "../presentation/hooks/useAuth";
import { ApiMaterialRepository } from "../infrastructure/repositories/ApiMaterialRepository";
import { ApiCategoryRepository } from "../infrastructure/repositories/ApiCategoryRepository";
import { ApiSubcategoryRepository } from "../infrastructure/repositories/ApiSubcategoryRepository";
import { ApiAuthRepository } from "../infrastructure/repositories/ApiAuthRepository";
import { ApiUserRepository } from "../infrastructure/repositories/ApiUserRepository";
import { BrowserSessionRepository } from "../infrastructure/repositories/BrowserSessionRepository";
import { createMaterial } from "../application/material/createMaterial";
import { updateMaterial } from "../application/material/updateMaterial";
import { deleteMaterial } from "../application/material/deleteMaterial";
import { toggleMaterialStatus } from "../application/material/toggleMaterialStatus";
import { bulkImportMaterials } from "../application/material/bulkImportMaterials";
import { getMaterials } from "../application/material/getMaterials";
import { getCategories } from "../application/category/getCategories";
import { createCategory } from "../application/category/createCategory";
import { updateCategory } from "../application/category/updateCategory";
import { deleteCategory } from "../application/category/deleteCategory";
import { saveCategoryWithSubcategories } from "../application/category/saveCategoryWithSubcategories";
import { getSubcategories } from "../application/subcategory/getSubcategories";
import { createSubcategory } from "../application/subcategory/createSubcategory";
import { updateSubcategory } from "../application/subcategory/updateSubcategory";
import { deleteSubcategory } from "../application/subcategory/deleteSubcategory";
import { saveTreeNode } from "../application/tree/saveTreeNode";
import { deleteTreeNode } from "../application/tree/deleteTreeNode";
import { login } from "../application/auth/login";
import { logout } from "../application/auth/logout";
import { restoreSession } from "../application/auth/restoreSession";
import { getRoleCatalogue } from "../application/auth/getRoleCatalogue";
import { getUsers } from "../application/user/getUsers";
import { createUser } from "../application/user/createUser";
import { updateUser } from "../application/user/updateUser";
import { changeUserRole } from "../application/user/changeUserRole";
import { toggleUserStatus } from "../application/user/toggleUserStatus";
import { deleteUser } from "../application/user/deleteUser";
import { getUserFormOptions } from "../application/user/getUserFormOptions";
import { AuthProvider } from "../presentation/auth/AuthContext";

export default function App() {
  const deps = useMemo(() => {
    const materialRepository = new ApiMaterialRepository();
    const categoryRepository = new ApiCategoryRepository();
    const subcategoryRepository = new ApiSubcategoryRepository();
    const authRepository = new ApiAuthRepository();
    const userRepository = new ApiUserRepository();
    const sessionRepository = new BrowserSessionRepository();

    // Every operation is built once here and then composed. The two resources
    // the category panel treats as one thing are joined into `tree`, so the
    // page never has to know which of them a node belongs to.
    const category = {
      getAll: getCategories(categoryRepository),
      create: createCategory(categoryRepository),
      update: updateCategory(categoryRepository),
      delete: deleteCategory(categoryRepository)
    };

    const subcategory = {
      getAll: getSubcategories(subcategoryRepository),
      create: createSubcategory(subcategoryRepository),
      update: updateSubcategory(subcategoryRepository),
      delete: deleteSubcategory(subcategoryRepository)
    };

    return {
      auth: {
        login: login(authRepository, sessionRepository),
        logout: logout(sessionRepository),
        restore: restoreSession(authRepository, sessionRepository),
        roles: getRoleCatalogue(authRepository),
        // Subscribing is the presentation's business; knowing that a 401 is
        // what ends a session is not.
        onSessionEnded: (handler) => sessionRepository.onEnded(handler)
      },
      materials: {
        getAll: getMaterials(materialRepository),
        create: createMaterial(materialRepository),
        update: updateMaterial(materialRepository),
        delete: deleteMaterial(materialRepository),
        toggleStatus: toggleMaterialStatus(materialRepository),
        bulkImport: bulkImportMaterials(materialRepository)
      },
      categories: {
        getAll: category.getAll,
        saveWithSubcategories: saveCategoryWithSubcategories({
          createCategory: category.create,
          updateCategory: category.update,
          createSubcategory: subcategory.create
        })
      },
      subcategories: {
        getAll: subcategory.getAll
      },
      tree: {
        save: saveTreeNode(category.update, subcategory.update),
        delete: deleteTreeNode(category.delete, subcategory.delete)
      },
      users: {
        getAll: getUsers(userRepository),
        create: createUser(userRepository),
        update: updateUser(userRepository),
        changeRole: changeUserRole(userRepository),
        toggleStatus: toggleUserStatus(userRepository),
        delete: deleteUser(userRepository),
        formOptions: getUserFormOptions(userRepository)
      }
    };
  }, []);

  const { user, restoring, notice, signIn, signOut } = useAuth(deps.auth);
  const [showImport, setShowImport] = useState(false);
  const [page, setPage] = useState("materials");

  // A stored token is being traded for the live user and its permissions.
  // Rendering the app first would flash a full-access UI at a viewer.
  if (restoring) {
    return (
      <div className="boot-screen">
        <div className="spinner" />
        <span>Restoring your session...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginPage onSignIn={signIn} notice={notice} loadRoles={deps.auth.roles} />
    );
  }

  // The provider still carries the role, so the sidebar can label it and the
  // API's own 401/403 handling keeps working — but no page or button is gated
  // on it any more.
  return (
    <AuthProvider user={user}>
      {page === "users" ? (
        <UsersPage
          deps={deps}
          user={user}
          onSignOut={signOut}
          page={page}
          onNavigate={setPage}
        />
      ) : (
        <MaterialPage
          deps={deps}
          user={user}
          onSignOut={signOut}
          page={page}
          onNavigate={setPage}
          showImport={showImport}
          setShowImport={setShowImport}
        />
      )}
    </AuthProvider>
  );
}

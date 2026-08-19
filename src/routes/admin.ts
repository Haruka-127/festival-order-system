import { Elysia } from "elysia";
import { adminItemRoutes } from "./admin/items";
import { adminLocationRoutes } from "./admin/locations";
import { adminOperationRoutes } from "./admin/operations";
import { adminPageRoutes } from "./admin/pages";
import { adminUserRoutes } from "./admin/users";

export const adminRoutes = new Elysia()
  .use(adminPageRoutes)
  .use(adminItemRoutes)
  .use(adminUserRoutes)
  .use(adminLocationRoutes)
  .use(adminOperationRoutes);

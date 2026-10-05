import type { FastifyInstance } from "fastify";
import { adminUsersRouteSchema } from "./admin.schema";

export async function adminRoutes(app: FastifyInstance) {
  // GET /admin/users
  app.get(
    "/admin/users",
    { preValidation: [app.authorizeAdmin], schema: adminUsersRouteSchema },
    async (request, reply) => {
      const page = Number((request.query as Record<string, string>).page ?? 1);
      const limit = Number((request.query as Record<string, string>).limit ?? 20);
      const skip = (page - 1) * limit;

      const collection = app.db.collection("users");

      const [users, total] = await Promise.all([
        collection
          .find({}, { projection: { passwordHash: 0 } })
          .skip(skip)
          .limit(limit)
          .toArray(),
        collection.countDocuments(),
      ]);

      return reply.send({
        data: users.map((u) => ({
          id: u._id.toString(),
          email: u.email,
          displayName: u.displayName,
          role: u.role,
          createdAt: (u.createdAt as Date).toISOString(),
          updatedAt: (u.updatedAt as Date).toISOString(),
        })),
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      });
    }
  );
}

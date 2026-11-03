
## Employee Profile Integration Requirement

The authentication middleware verifies the JWT and loads
the active user from PostgreSQL.

The middleware provides:
- req.auth.userId
- req.auth.role
- req.auth.user

The Employee Case API must use req.auth.userId
to find the corresponding employee profile.

### Existing database relationship

The database already contains:
- users
- employees
- employee_categories

employees.user_id references users.id.

employees.category_id requires a valid
employee_categories.id.

### Current limitation

The isolated test database currently has no
employee category records.

The fictional demo login account can authenticate,
but a linked employee profile cannot be created
until an appropriate active test category exists.

### Integration requirements

1. Obtain an approved fictional/test employee category.
2. Create the fictional user and linked employee
   profile in a single database transaction.
3. Use the verified user ID for employee lookup.
4. Never trust userId or role from request bodies.
5. Clean up only the fictional demo records.
6. Do not modify existing clearance workflow rules.

The Employee Case API integration will be completed
separately after the required configuration is available.

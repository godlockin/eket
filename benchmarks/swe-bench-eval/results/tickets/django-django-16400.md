# django-django-16400

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: 0bd2c0c9015b53c41394a1c0989afbfd94dc2830
**创建时间**: 2022-12-23T17:17:00Z

## 问题描述

migrate management command does not respect database parameter when adding Permissions.
Description
	 
		(last modified by Vasanth)
	 
When invoking migrate with a database parameter, the migration runs successfully. However, there seems to be a DB read request that runs after the migration. This call does not respect the db param and invokes the db router .
When naming the db as a parameter, all DB calls in the context of the migrate command are expected to use the database specified.
I came across this as I am currently using a thread-local variable to get the active DB with a custom DB router for a multi-tenant service .
Minimal example 
Setup the custom middleware and custom DB Router as show below. Then run any DB migration. We see that "read {}" is being printed before the exception message.
Ideally none of this code must be called as the DB was specified during management command.
from threading import local
from django.conf import settings
local_state = local()
class InvalidTenantException(Exception):
	pass
class TenantSubdomainMiddleware:
	def __init__(self, get_response):
		self.get_response = get_response
	def __call__(self, request):
		## Get Subdomain
		host = request.get_host().split(":")[0]
		local_state.subdomain = (
			# We assume single level of subdomain : app.service.com 
			# HOST_IP : used to for local dev. 
			host if host in settings.HOST_IP else host.split(".")[0]
		)
		response = self.get_response(request)
		return response
class TenantDatabaseRouter:
	def _default_db(self):
		subdomain = getattr(local_state, "subdomain", None)
		if subdomain is not None and subdomain in settings.TENANT_MAP:
			db_name = settings.TENANT_MAP[local_state.subdomain]
			return db_name
		else:
			raise InvalidTenantException()
	def db_for_read(self, model, **hints):
		print("read", hints)
		return self._default_db()
	def db_for_write(self, model, **hints):
		print("write", hints)
		return self._default_db()
	def allow_relation(self, obj1, obj2, **hints):
		return None
	def allow_migrate(self, db, app_label, model_name=None, **hints):
		return None
## settings.py
MIDDLEWARE = [
	"utils.tenant_db_router.TenantSubdomainMiddleware",
	"django.middleware.security.SecurityMiddleware",
	...
]
TENANT_MAP = {"localhost":"default", "tenant_1":"default"}
DATABASE_ROUTERS = ["utils.tenant_db_router.TenantDatabaseRouter"]


## 提示信息

Thanks for this report, it's related with adding missing permissions. I was able to fix this by setting _state.db, however I'm not convinced that it's the best solution: django/contrib/auth/management/__init__.py diff --git a/django/contrib/auth/management/__init__.py b/django/contrib/auth/management/__init__.py index 0b5a982617..27fe0df1d7 100644 a b def create_permissions( 9494 ) 9595 .values_list("content_type", "codename") 9696 ) 97 98 perms = [ 99 Permission(codename=codename, name=name, content_type=ct) 100 for ct, (codename, name) in searched_perms 101 if (ct.pk, codename) not in all_perms 102 ] 97 perms = [] 98 for ct, (codename, name) in searched_perms: 99 if (ct.pk, codename) not in all_perms: 100 permission = Permission() 101 permission._state.db = using 102 permission.codename = codename 103 permission.name = name 104 permission.content_type = ct 105 perms.append(permission) 103106 Permission.objects.using(using).bulk_create(perms) 104107 if verbosity >= 2: 105108 for perm in perms: Partly related to #29843.
This patch resolves the problem at my end. I hope it can be added in the 4.1.4 since #29843 seems to be not actively worked on at the moment.
After diving a bit deeper it turned out that the issue was with one of the libraries in my project which was not adapted for multi-DB. I've made a PR with changes on the django-admin-interface which resolved my issue.
Aryan, this ticket doesn't have submitted PR.
Replying to Mariusz Felisiak: Thanks for this report, it's related with adding missing permissions. I was able to fix this by setting _state.db, however I'm not convinced that it's the best solution: django/contrib/auth/management/__init__.py diff --git a/django/contrib/auth/management/__init__.py b/django/contrib/auth/management/__init__.py index 0b5a982617..27fe0df1d7 100644 a b def create_permissions( 9494 ) 9595 .values_list("content_type", "codename") 9696 ) 97 98 perms = [ 99 Permission(codename=codename, name=name, content_type=ct) 100 for ct, (codename, name) in searched_perms 101 if (ct.pk, codename) not in all_perms 102 ] 97 perms = [] 98 for ct, (codename, name) in searched_perms: 99 if (ct.pk, codename) not in all_perms: 100 permission = Permission() 101 permission._state.db = using 102 permission.codename = codename 103 permission.name = name 104 permission.content_type = ct 105 perms.append(permission) 103106 Permission.objects.using(using).bulk_create(perms) 104107 if verbosity >= 2: 105108 for perm in perms: Partly related to #29843. I think bulk_create already sets the _state.db to the value passed in .using(), right? Or is it in bulk_create that we require _state.db to be set earlier? In which case, we could perhaps change something inside of this method. Replying to Vasanth: After diving a bit deeper it turned out that the issue was with one of the libraries in my project which was not adapted for multi-DB. I've made a PR with changes on the django-admin-interface which resolved my issue. So would it be relevant to close the issue or is the bug really related to Django itself?
Replying to David Wobrock: I think bulk_create already sets the _state.db to the value passed in .using(), right? Yes, but it's a different issue, strictly related with Permission and its content_type. get_content_type() is trying to find a content type using obj._state.db so when we create a Permission() without ._state.db it will first try to find a content type in the default db. So would it be relevant to close the issue or is the bug really related to Django itself? IMO we should fix this for permissions.
Replying to Mariusz Felisiak: Replying to David Wobrock: I think bulk_create already sets the _state.db to the value passed in .using(), right? Yes, but it's a different issue, strictly related with Permission and its content_type. get_content_type() is trying to find a content type using obj._state.db so when we create a Permission() without ._state.db it will first try to find a content type in the default db. Okay, I understand the issue now, thanks for the details!! First thing, it makes me wonder why we require to have a DB attribute set, at a moment where we are not (yet) interacting with the DB. So we are currently checking, when setting the content_type FK, that the router allows this relation. I guess one option is to not do that for not-saved model instances. Would it make sense to defer this to when we start interacting with the DB? But it brings a whole other lot of changes and challenges, like changing a deep behaviour of FKs and multi-tenancy :/ Apart from that, if we don't want to set directly the internal attribute _state.db, I guess we would need a proper way to pass the db/using to the model instantiation. What would be the most Django-y way? Passing it through the model constructor => this has quite a large impact, as a keyword argument would possibly shadow existing field names: Permission(..., db=using). Quite risky in terms of backward compatibility I guess. Adding a method to Model? Something like: Permission(...).using(db), which could perhaps then be re-used in other places also. (EDIT: which wouldn't work, as the setting the FK happens before setting the DB alias.) What do you think ? :) Or am I missing other solutions?
Apart from that, if we don't want to set directly the internal attribute _state.db, I guess we would need a proper way to pass the db/using to the model instantiation. _state is ​documented so using it is not so bad. What would be the most Django-y way? Passing it through the model constructor => this has quite a large impact, as a keyword argument would possibly shadow existing field names: Permission(..., db=using). Quite risky in terms of backward compatibility I guess. Adding a method to Model? Something like: Permission(...).using(db), which could perhaps then be re-used in other places also. What do you think ? :) Or am I missing other solutions? Django doesn't support cross-db relationships and users were always responsible for assigning related objects from the same db. I don't think that we should add more logic to do this. The Permission-content_type issue is really an edge case in managing relations, as for me we don't need a generic solution for it.

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_set_permissions_fk_to_using_parameter (auth_tests.test_management.CreatePermissionsMultipleDatabasesTests)"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending

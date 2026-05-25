# django-django-15738

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: 6f73eb9d90cfec684529aab48d517e3d6449ba8c
**创建时间**: 2022-05-27T13:20:14Z

## 问题描述

Models migration with change field foreign to many and deleting unique together.
Description
	 
		(last modified by Simon Charette)
	 
I have models like
class Authors(models.Model):
	project_data_set = models.ForeignKey(
		ProjectDataSet,
		on_delete=models.PROTECT
	)
	state = models.IntegerField()
	start_date = models.DateField()
	class Meta:
		 unique_together = (('project_data_set', 'state', 'start_date'),)
and
class DataSet(models.Model):
	name = models.TextField(max_length=50)
class Project(models.Model):
	data_sets = models.ManyToManyField(
		DataSet,
		through='ProjectDataSet',
	)
	name = models.TextField(max_length=50)
class ProjectDataSet(models.Model):
	"""
	Cross table of data set and project
	"""
	data_set = models.ForeignKey(DataSet, on_delete=models.PROTECT)
	project = models.ForeignKey(Project, on_delete=models.PROTECT)
	class Meta:
		unique_together = (('data_set', 'project'),)
when i want to change field project_data_set in Authors model from foreign key field to many to many field I must delete a unique_together, cause it can't be on many to many field.
Then my model should be like:
class Authors(models.Model):
	project_data_set = models.ManyToManyField(
		ProjectDataSet,
	)
	state = models.IntegerField()
	start_date = models.DateField()
But when I want to do a migrations.
python3 manage.py makemigrations
python3 manage.py migrate
I have error:
ValueError: Found wrong number (0) of constraints for app_authors(project_data_set, state, start_date)
The database is on production, so I can't delete previous initial migrations, and this error isn't depending on database, cause I delete it and error is still the same.
My solve is to first delete unique_together, then do a makemigrations and then migrate. After that change the field from foreign key to many to many field, then do a makemigrations and then migrate.
But in this way I have 2 migrations instead of one.
I added attachment with this project, download it and then do makemigrations and then migrate to see this error.


## 提示信息

Download this file and then do makemigrations and migrate to see this error.
Thanks for the report. Tentatively accepting, however I'm not sure if we can sort these operations properly, we should probably alter unique_together first migrations.AlterUniqueTogether( name='authors', unique_together=set(), ), migrations.RemoveField( model_name='authors', name='project_data_set', ), migrations.AddField( model_name='authors', name='project_data_set', field=models.ManyToManyField(to='dict.ProjectDataSet'), ), You should take into account that you'll lose all data because ForeignKey cannot be altered to ManyToManyField.
I agree that you'll loose data but Alter(Index|Unique)Together should always be sorted before RemoveField ​https://github.com/django/django/blob/b502061027b90499f2e20210f944292cecd74d24/django/db/migrations/autodetector.py#L910 ​https://github.com/django/django/blob/b502061027b90499f2e20210f944292cecd74d24/django/db/migrations/autodetector.py#L424-L430 So something's broken here in a few different ways and I suspect it's due to the fact the same field name project_data_set is reused for the many-to-many field. If you start from class Authors(models.Model): project_data_set = models.ForeignKey( ProjectDataSet, on_delete=models.PROTECT ) state = models.IntegerField() start_date = models.DateField() class Meta: unique_together = (('project_data_set', 'state', 'start_date'),) And generate makemigrations for class Authors(models.Model): project_data_set = models.ManyToManyField(ProjectDataSet) state = models.IntegerField() start_date = models.DateField() You'll get two migrations with the following operations # 0002 operations = [ migrations.AddField( model_name='authors', name='project_data_set', field=models.ManyToManyField(to='ticket_31788.ProjectDataSet'), ), migrations.AlterUniqueTogether( name='authors', unique_together=set(), ), migrations.RemoveField( model_name='authors', name='project_data_set', ), ] # 0003 operations = [ migrations.AddField( model_name='authors', name='project_data_set', field=models.ManyToManyField(to='ticket_31788.ProjectDataSet'), ), ] If you change the name of the field to something else like project_data_sets every work as expected operations = [ migrations.AddField( model_name='authors', name='project_data_sets', field=models.ManyToManyField(to='ticket_31788.ProjectDataSet'), ), migrations.AlterUniqueTogether( name='authors', unique_together=set(), ), migrations.RemoveField( model_name='authors', name='project_data_set', ), ] It seems like there's some bad interactions between generate_removed_fields and generate_added_fields when a field with the same name is added.

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_alter_unique_together_fk_to_m2m (migrations.test_autodetector.AutodetectorTests)", "#23938 - Changing a ManyToManyField into a concrete field"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending

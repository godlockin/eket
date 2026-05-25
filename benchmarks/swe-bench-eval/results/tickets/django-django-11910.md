# django-django-11910

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: d232fd76a85870daf345fd8f8d617fe7802ae194
**创建时间**: 2019-10-14T01:56:49Z

## 问题描述

ForeignKey's to_field parameter gets the old field's name when renaming a PrimaryKey.
Description
	
Having these two models 
class ModelA(models.Model):
	field_wrong = models.CharField('field1', max_length=50, primary_key=True) # I'm a Primary key.
class ModelB(models.Model):
	field_fk = models.ForeignKey(ModelA, blank=True, null=True, on_delete=models.CASCADE) 
... migrations applyed ...
the ModelA.field_wrong field has been renamed ... and Django recognizes the "renaming"
# Primary key renamed
class ModelA(models.Model):
	field_fixed = models.CharField('field1', max_length=50, primary_key=True) # I'm a Primary key.
Attempts to to_field parameter. 
The to_field points to the old_name (field_typo) and not to the new one ("field_fixed")
class Migration(migrations.Migration):
	dependencies = [
		('app1', '0001_initial'),
	]
	operations = [
		migrations.RenameField(
			model_name='modela',
			old_name='field_wrong',
			new_name='field_fixed',
		),
		migrations.AlterField(
			model_name='modelb',
			name='modela',
			field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, to='app1.ModelB', to_field='field_wrong'),
		),
	]


## 提示信息

Thanks for this ticket. It looks like a regression in dcdd219ee1e062dc6189f382e0298e0adf5d5ddf, because an AlterField operation wasn't generated in such cases before this change (and I don't think we need it).

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_rename_referenced_primary_key (migrations.test_autodetector.AutodetectorTests)"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending

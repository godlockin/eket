# django-django-11001

**来源**: SWE-bench Lite
**仓库**: django/django
**Base Commit**: ef082ebb84f00e38af4e8880d04e8365c2766d34
**创建时间**: 2019-02-17T13:02:09Z

## 问题描述

Incorrect removal of order_by clause created as multiline RawSQL
Description
	
Hi.
The SQLCompiler is ripping off one of my "order by" clause, because he "thinks" the clause was already "seen" (in SQLCompiler.get_order_by()). I'm using expressions written as multiline RawSQLs, which are similar but not the same. 
The bug is located in SQLCompiler.get_order_by(), somewhere around line computing part of SQL query without ordering:
without_ordering = self.ordering_parts.search(sql).group(1)
The sql variable contains multiline sql. As a result, the self.ordering_parts regular expression is returning just a line containing ASC or DESC words. This line is added to seen set, and because my raw queries have identical last lines, only the first clasue is returing from SQLCompiler.get_order_by().
As a quick/temporal fix I can suggest making sql variable clean of newline characters, like this:
sql_oneline = ' '.join(sql.split('\n'))
without_ordering = self.ordering_parts.search(sql_oneline).group(1)
Note: beware of unicode (Py2.x u'') and EOL dragons (\r).
Example of my query:
	return MyModel.objects.all().order_by(
		RawSQL('''
			case when status in ('accepted', 'verification')
				 then 2 else 1 end''', []).desc(),
		RawSQL('''
			case when status in ('accepted', 'verification')
				 then (accepted_datetime, preferred_datetime)
				 else null end''', []).asc(),
		RawSQL('''
			case when status not in ('accepted', 'verification')
				 then (accepted_datetime, preferred_datetime, created_at)
				 else null end''', []).desc())
The ordering_parts.search is returing accordingly:
'				 then 2 else 1 end)'
'				 else null end'
'				 else null end'
Second RawSQL with a				 else null end part is removed from query.
The fun thing is that the issue can be solved by workaround by adding a space or any other char to the last line. 
So in case of RawSQL I can just say, that current implementation of avoiding duplicates in order by clause works only for special/rare cases (or does not work in all cases). 
The bug filed here is about wrong identification of duplicates (because it compares only last line of SQL passed to order by clause).
Hope my notes will help you fixing the issue. Sorry for my english.


## 提示信息

Is there a reason you can't use ​conditional expressions, e.g. something like: MyModel.objects.annotate( custom_order=Case( When(...), ) ).order_by('custom_order') I'm thinking that would avoid fiddly ordering_parts regular expression. If there's some shortcoming to that approach, it might be easier to address that. Allowing the ordering optimization stuff to handle arbitrary RawSQL may be difficult.
Is there a reason you can't use ​conditional expressions No, but I didn't knew about the issue, and writing raw sqls is sometimes faster (not in this case ;) I'm really happy having possibility to mix raw sqls with object queries. Next time I'll use expressions, for sure. Allowing the ordering optimization stuff to handle arbitrary RawSQL may be difficult. Personally I'd like to skip RawSQL clauses in the block which is responsible for finding duplicates. If someone is using raw sqls, he knows the best what he is doing, IMO. And it is quite strange if Django removes silently part of your SQL. This is very confusing. And please note that printing a Query instance was generating incomplete sql, but while checking Query.order_by manually, the return value was containing all clauses. I thought that just printing was affected, but our QA dept told me the truth ;) I know there is no effective way to compare similarity of two raw clauses. This may be hard for expression objects, too, but you have a possibility to implement some __eq__ magic (instead of comparation of generated sqls). Unfortunately I don't know why duplicates detection was implemented, so it's hard to tell how to improve this part.
Patches welcome, I suppose.
​PR
Is there a reason why you didn't add tests?
I was waiting for confirmation, I've added a test. Is it enough?
Some additional test coverage needed.

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["test_order_by_multiline_sql (expressions.tests.BasicExpressionsTests)", "test_order_of_operations (expressions.tests.BasicExpressionsTests)"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending

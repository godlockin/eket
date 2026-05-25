# sphinx-doc-sphinx-8474

**来源**: SWE-bench Lite
**仓库**: sphinx-doc/sphinx
**Base Commit**: 3ea1ec84cc610f7a9f4f6b354e264565254923ff
**创建时间**: 2020-11-22T16:24:25Z

## 问题描述

v3.3 upgrade started generating "WARNING: no number is assigned for table" warnings
We've updated to Sphinx 3.3 in our documentation, and suddenly the following warning started popping up in our builds when we build either `singlehtml` or `latex`.:

`WARNING: no number is assigned for table:`

I looked through the changelog but it didn't seem like there was anything related to `numref` that was changed, but perhaps I missed something? Could anyone point me to a change in the numref logic so I can figure out where these warnings are coming from?


## 提示信息

I digged into this a little bit more and it seems like the `id` of the table isn't properly making it into `env.toc_fignumbers`. If I set `:name: mylabel`, regardless the I see something like this in `env.toc_fignumbers`

```
 'pagename': {'table': {'id3': (1,)},
```

So it seems like `id3` is being used for the table id instead of `mylabel`
@choldgraf I suspect it's related to this: https://github.com/sphinx-doc/sphinx/commit/66dda1fc50249e9da62e79380251d8795b8e36df.
Oooohhh good find! 👏👏👏
Confirmed that this was the issue - we had been referencing Tables that didn't have a title with `numref`, and this bugfix (I guess it was a bugfix?) caused us to start raising errors. Perhaps this restriction about tables needing a title could be documented more clearly?
The `numfig` option has been described as follows.

>If true, figures, tables and code-blocks are automatically numbered if they have a caption.
https://www.sphinx-doc.org/en/master/usage/configuration.html#confval-numfig

It says a table not having a title is not assigned a number. Then `numfig` can't refer it because of no table number.
> It says a table not having a title is not assigned a number. Then `numfig` can't refer it because of no table number.

This means that a user is not able to add a numbered table with no caption correct? I could understand such restrictions for Jupyter Book but it doesn't make a lot of sense for Sphinx IMO. I think Sphinx should allow users to have enumerable nodes with no caption. What do you think @choldgraf?
>This means that a user is not able to add a numbered table with no caption correct?

Yes. Since the beginning, numfig feature only supports captioned figures and tables. I don't know how many people want to assign numbers to non-captioned items. But this is the first feature request, AFAIK.
I think my take is that I don't think it is super useful to be able to have numbered references for things that don't have titles/captions. However, it also didn't feel like it *shouldn't* be possible, and so I assumed that it was possible (and thus ran into what I thought was a bug). I think it would be more helpful to surface a more informative warning like "You attempted to add a numbered reference to a Table without a title, add a title for this to work." (or, surface this gotcha in the documentation more obviously like with a `warning` or `note` directive?)
@tk0miya @choldgraf both make good points for restricting `figure` and `table` directives with no caption. My issue is that this is done at the enumerable node which implies that **all** enumerable nodes with no title/caption are skipped - not just `figure` and `table`.

> Since the beginning, numfig feature only supports captioned figures and tables.

Just to clarify, `numfig` feature has - prior to v3.3.0 - supported uncaptioned tables but it did not display the caption. The user was able to reference the table using `numref` role (see example below). In the event that the user tried to reference the caption (aka `name` placeholder), Sphinx threw a warning indicating that there was no caption. This solution seemed sensible to me because it allowed other extensions to utilize enumerable nodes regardless of caption/no caption restriction.

My main motivation for wanting to revert back or restrict the bugfix to tables and figures is because both the extensions I've worked on depend on the utilization of enumerable nodes regardless of captions/no captions. I think it wouldn't be too difficult to add the information to `env.toc_fignumbers` but I wanted to make a case before I addressed this in [sphinx-proof](https://github.com/executablebooks/sphinx-proof) and [sphinx-exercise](https://github.com/executablebooks/sphinx-exercise).

**Example**
Sphinx Version - v3.2.1

````md
```{list-table} 
:header-rows: 1
:name: table1

* - Training
  - Validation
* - 0
  - 5
* - 13720
  - 2744
```
Referencing table using `numref`: {numref}`table1`.

```{list-table} Caption here
:header-rows: 1
:name: table2

* - Training
  - Validation
* - 0
  - 5
* - 13720
  - 2744
```
Referencing table using `numref`: {numref}`table2`.
````

<img width="286" alt="Screen Shot 2020-11-10 at 1 13 15 PM" src="https://user-images.githubusercontent.com/33075058/98672880-c8ebfa80-2356-11eb-820f-8c192fcfe1d8.png">
So it sounds like the `tl;dr` from @najuzilu is that in other extensions, she is *using* the fact that you can reference non-captioned elements with a number, and that Sphinx now removing this ability is breaking those extensions. Is that right?
That's correct @choldgraf 
This is a screenshot of the PDF that is generated from @najuzilu 's example with v3.2.1. As you see, it does not work correctly in LaTeX output.
<img width="689" alt="スクリーンショット 2020-11-23 0 44 49" src="https://user-images.githubusercontent.com/748828/99908313-42a3c100-2d25-11eb-9350-ce74e12ef375.png">

I'd not like to support assigning numbers to no captioned items until fixed this (if somebody needs it).

## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["tests/test_build_html.py::test_numfig_without_numbered_toctree_warn", "tests/test_build_html.py::test_numfig_with_numbered_toctree_warn", "tests/test_build_html.py::test_numfig_with_prefix_warn", "tests/test_build_html.py::test_numfig_with_secnum_depth_warn"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending

# sphinx-doc-sphinx-8273

**来源**: SWE-bench Lite
**仓库**: sphinx-doc/sphinx
**Base Commit**: 88b81a06eb635a1596617f8971fa97a84c069e93
**创建时间**: 2020-10-03T13:31:13Z

## 问题描述

Generate man page section directories
**Current man page generation does not conform to `MANPATH` search functionality**
Currently, all generated man pages are placed in to a single-level directory: `<build-dir>/man`. Unfortunately, this cannot be used in combination with the unix `MANPATH` environment variable. The `man` program explicitly looks for man pages in section directories (such as `man/man1`, etc.). 

**Describe the solution you'd like**
It would be great if sphinx would automatically create the section directories (e.g., `man/man1/`, `man/man3/`, etc.) and place each generated man page within appropriate section.

**Describe alternatives you've considered**
This problem can be over come within our project’s build system, ensuring the built man pages are installed in a correct location, but it would be nice if the build directory had the proper layout.

I’m happy to take a crack at implementing a fix, though this change in behavior may break some people who expect everything to appear in a `man/` directory. 



## 提示信息

I think that users should copy the generated man file to the appropriate directory. The build directory is not an appropriate directory to manage man pages. So no section directory is needed, AFAIK. I don't know why do you want to set `MANPATH` to the output directory. To check the output, you can give the path to the man file for man command like `man _build/man/sphinx-build.1`. Please let me know your purpose in detail.
From a [separate github thread](https://github.com/flux-framework/flux-core/pull/3033#issuecomment-662515605) that describes the specific use case in some more detail:
> When run in a builddir, `src/cmd/flux` sets `MANPATH` such that `man flux` will display the current builddir version of `flux.1`. This is done so that documentation matches the version of Flux being run.

Essentially, we are trying to make running in-tree look as similar to running an installed version as possible.

---

> I think that users should copy the generated man file to the appropriate directory.

On `make install`, we do have the automake setup to copy the manpages to `$prefix/man/man1`, `$prefix/man/man3`, etc.  This did require some extra work though, since each source file and its destination has to be explicitly enumerated in the automake file.  If the man pages were built into their respective sections, a recursive copy would work too.  Not a huge deal, but just another factor I wanted to bring up.
Understandable. +1 to change the structure of output directory. As commented, it causes a breaking change for users. So I propose you to add a configuration `man_make_section_directory = (True | False)` for migration. During 3.x, it defaults to False, and it will default to True on 4.0 release. What do you think?

>I’m happy to take a crack at implementing a fix, though this change in behavior may break some people who expect everything to appear in a man/ directory.

It would be very nice if you send us a PR :-)


## 验收标准

- [ ] 生成有效 Patch
- [ ] 通过 FAIL_TO_PASS 测试: ["tests/test_build_manpage.py::test_man_make_section_directory"]
- [ ] 不破坏 PASS_TO_PASS 测试

## 状态

status: pending

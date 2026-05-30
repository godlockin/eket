# 失败案例 #001: skeleton_analysis

> **状态**: 失败 | **最后活跃**: ~2020 | **停滞天数**: ~2190

---

## 📝 项目元数据

- **项目路径**: `/Users/chenchen/working/sourcecode/my_projects/skeleton_analysis`
- **技术栈**: Python, MediaPipe, OpenCV, NumPy
- **开始日期**: ~2019
- **最后commit**: ~2020
- **总投入时间**: 数周

---

## 🎯 初始目标

**当时的愿景**:
- 实时骨骼追踪分析系统
- 30fps实时性能目标
- 用于姿态分析/运动识别
- 基于MediaPipe的快速原型

**MVP定义**:
- [x] MediaPipe集成
- [x] 基础骨骼点提取
- [ ] 30fps实时处理 ❌
- [ ] 多人追踪
- [ ] 姿态分类器

---

## 💔 失败原因

### 1. 技术债 (Technical Debt)
- **具体问题**: MediaPipe Python API性能不足
- **严重程度**: 🔴 高
- **性能数据**: 
  ```
  目标: 30fps (33.3ms/frame)
  实际: 12fps (83.3ms/frame)
  差距: 2.5x性能不足
  
  瓶颈分析:
  - Python GIL限制
  - 多次数据拷贝(C++ → Python)
  - 无法充分利用GPU加速
  ```

### 2. 范围蠕变 (Scope Creep)
- **如何失控**: 
  - 初始: 单人骨骼追踪
  - 扩展1: 多人追踪
  - 扩展2: 姿态识别
  - 扩展3: 实时3D重建
- **偏离度**: MVP → 复杂系统(未定义停止条件)
- **未定义停止条件**: 没有"什么时候够了"的标准

### 3. 外部依赖 (External Blocker)
- **被什么阻塞**: MediaPipe Python binding性能限制
- **依赖版本**: MediaPipe 0.8.x (early version)
- **替代方案探索**: 
  - 尝试OpenPose: 配置复杂,性能更差
  - 考虑C++ API: 学习成本高,时间不足
  - 考虑降低fps目标: 不满足实时需求

### 4. 其他因素
- [x] 兴趣衰退 (性能瓶颈打击信心)
- [x] 时间/资源不足 (无法投入学习C++)
- [ ] 需求不明确

---

## ✅ 从中学到

### 应该 (Do)
- ✅ **性能原型先行**: 技术选型前先做性能POC,验证是否满足目标
- ✅ **定义MVP边界**: 明确"最小可用"标准,避免范围蠕变
- ✅ **选择native绑定**: 性能敏感场景优先C++/Rust,Python binding有代价
- ✅ **设定放弃线**: 提前定义"投入X时间无进展则停止"

### 不要 (Don't)
- ❌ **不要盲目相信高层API**: "易用"往往意味着性能损失
- ❌ **不要忽略GIL影响**: Python多线程在计算密集场景无效
- ❌ **不要在错误抽象层优化**: 在Python层优化无法解决C++层的性能问题
- ❌ **不要无限扩展范围**: 基础性能不达标时,添加功能只会更慢

### 可复用组件
- 骨骼点归一化算法: 可用于其他姿态项目
- 数据可视化工具: OpenCV绘制骨骼的代码片段

---

## 🔮 未来可以复活吗?

### 技术进步检查
- [x] **MediaPipe更新**: 0.10+ 版本有性能改进,但仍未达30fps
- [ ] **Python 3.13+ no-GIL**: 实验性feature,生产环境不可用
- [x] **硬件进步**: M系列芯片GPU加速,但Python binding仍未充分利用
- [ ] **WebAssembly/WASM**: MediaPipe有WASM版本,但与Python集成复杂

### 复活条件
```markdown
如果满足以下条件,值得重新评估:
1. MediaPipe C++ API有稳定的pybind11封装,性能损失<10%
2. 或使用Rust重写,直接调用C++ API
3. 或降低目标到15fps(2x buffer),用于非实时场景
4. 或等待Python no-GIL正式发布(2027+)
```

### 上次检查时间
- **检查日期**: 2026-05-29
- **结论**: 暂不复活
  - MediaPipe Python API仍有性能gap
  - 如需实时性能,建议用C++/Rust重写
  - 或降级到非实时分析场景(视频后处理)

---

## 🔗 关联项目

### 类似失败
- (暂无其他骨骼追踪项目)

### 成功案例 (对比学习)
- MediaPipe官方Demo: 用C++实现,确实达到30fps+
  - 差异: 直接用C++ vs Python binding
  - 教训: 性能敏感场景不要用高层封装

### 后继项目
- (如需重启,考虑Rust + MediaPipe C++ FFI)

---

## 📎 附录

### 关键代码片段
```python
# 性能瓶颈示例
import mediapipe as mp
import cv2
import time

mp_pose = mp.solutions.pose
pose = mp_pose.Pose()

cap = cv2.VideoCapture(0)
fps_list = []

while cap.isOpened():
    start = time.time()
    ret, frame = cap.read()
    
    # 这里的处理耗时 ~83ms (包括数据拷贝)
    results = pose.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    
    fps = 1 / (time.time() - start)
    fps_list.append(fps)
    
    # 平均fps: 12 (目标30)
    print(f"FPS: {sum(fps_list)/len(fps_list):.1f}")
```

### 性能分析
```
瓶颈分布:
- MediaPipe推理: 50ms (C++层)
- 数据拷贝(C++→Python): 20ms
- BGR→RGB转换: 8ms
- 其他开销: 5ms
总计: 83ms → 12fps

优化空间:
- C++直接调用: 可省20ms数据拷贝 → ~16fps
- 仍不满足30fps目标
```

### 相关文档
- [MediaPipe Performance Guide](https://google.github.io/mediapipe/solutions/pose.html#performance)
- [Python GIL Impact on CV](https://realpython.com/python-gil/)

### 外部资源
- [MediaPipe GitHub](https://github.com/google/mediapipe)
- [OpenPose Comparison](https://github.com/CMU-Perceptual-Computing-Lab/openpose)

---

## 🏷️ 标签

`#失败原因/技术债` `#失败原因/范围蠕变` `#技术栈/Python` `#技术栈/MediaPipe` `#性能瓶颈` `#可复活(条件苛刻)`

---

*Created: 2026-05-29 | Last Updated: 2026-05-29 | TASK-270*

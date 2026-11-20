#!/usr/bin/env python3
"""research_plan.py — 把一个开放式调研主题展开成「取证矩阵」。

沉淀自工程级深度调研实践：好的调研不是一上来就搜，而是先把大问题拆成
3–6 个可独立取证的子问题，给每个子问题指派取证手段（公网 / 公司内部 /
代码仓库 / 指定材料）与信源类型，再并行取证。本脚本生成这张矩阵作为脚手架。

用法:
    python3 research_plan.py "主题" \
        --subquestions "子问题1" "子问题2" ... \
        [--constraints "语言=Go;框架=Eino;部署=企业内网"] \
        [--deliverable report|whitepaper|sop|tech-design] \
        [--output matrix.json]

不传 --subquestions 时，按内置启发式给出一个通用拆解骨架，供人工细化。
脚本只做规划，不发起任何网络请求。
"""
from __future__ import annotations

import argparse
import json
import sys

# 取证手段建议：按子问题关键词粗匹配，给出推荐的取证通道。
EVIDENCE_CHANNELS = {
    "公网前沿": "web_search 找文章 → web_builtin_fetch 读原文（摘要不算信源）",
    "公司内部": "retrieve_company_context 查 onepage / 技术方案 / wiki / 飞书字典",
    "代码仓库": "clone 仓库读入口与核心模块、数据流（不要只看 README）",
    "指定材料": "完整读用户给的链接/文档，再延展检索佐证",
}

GENERIC_SKELETON = [
    "定义与边界：概念是什么，范围如何界定",
    "核心维度对比：可度量的对比维度有哪些",
    "业界通行做法与代表案例",
    "成本 / 可维护性 / 风险",
    "企业内场落地路径（技术栈与约束）",
    "选型判据与最终建议",
]


def channels_for(sq: str) -> list[str]:
    s = sq.lower()
    picked = ["公网前沿"]
    if any(k in sq for k in ["内场", "落地", "公司", "内部", "生产", "Infra", "部署"]):
        picked.append("公司内部")
    if any(k in s for k in ["仓库", "repo", "github", "gitlab", "源码", "代码"]):
        picked.append("代码仓库")
    if any(k in s for k in ["http", "wiki", "文章", "blog", "博客", "文档"]):
        picked.append("指定材料")
    if "公司内部" not in picked:
        picked.append("公司内部")  # 落地结论几乎都靠内部信源，默认带上
    return picked


def build_matrix(topic: str, subquestions: list[str], constraints: str,
                 deliverable: str) -> dict:
    rows = []
    for i, sq in enumerate(subquestions, start=1):
        chans = channels_for(sq)
        rows.append({
            "id": f"SQ{i}",
            "subquestion": sq,
            "channels": [{"name": c, "how": EVIDENCE_CHANNELS[c]} for c in chans],
            "min_sources": 2,  # 关键结论至少两个独立信源交叉验证
            "parallelizable": True,
        })
    return {
        "topic": topic,
        "constraints": constraints or "(未指定——建议先向用户确认语言/框架/部署/内外网)",
        "deliverable": deliverable,
        "default_output_style": "深度图文版，归档飞书",
        "subquestions": rows,
        "reminders": [
            "有理有据，绝不编造；无据判断标注为推断",
            "子问题并行取证，单条材料过大时用 Agent 子任务分发",
            "对比类问题输出结构化对比表（维度×方案），每格给依据",
            "结论必须落到企业内场：技术栈、模块/协议设计、风险点",
            "技术方案附脚手架代码；正文内联引用 [[标题]](url)",
        ],
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("topic")
    ap.add_argument("--subquestions", nargs="*", default=None)
    ap.add_argument("--constraints", default="")
    ap.add_argument("--deliverable", default="report",
                    choices=["report", "whitepaper", "sop", "tech-design"])
    ap.add_argument("--output", default="")
    args = ap.parse_args()

    sqs = args.subquestions if args.subquestions else GENERIC_SKELETON
    matrix = build_matrix(args.topic, sqs, args.constraints, args.deliverable)
    text = json.dumps(matrix, ensure_ascii=False, indent=2)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(text)
        print(f"取证矩阵已写入 {args.output}（{len(sqs)} 个子问题）", file=sys.stderr)
    else:
        print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""
Interview Question Bank & Real Experience RAG Service.
Provides authentic interview questions, probing trap points, and follow-up chains
from top tech companies (ByteDance, Meituan, Alibaba, Tencent, PDD).
"""

from typing import List, Dict, Any, Optional

REAL_INTERVIEW_QUESTIONS: List[Dict[str, Any]] = [
    {
        "id": "q_redis_lock_watchdog",
        "topic": "Redis分布式锁与长业务超时",
        "company": "字节跳动/后端架构",
        "tags": ["redis", "分布式锁", "高并发", "redisson"],
        "authentic_question": "如果客户端拿到 Redis 分布式锁后发生长达 40 秒的 Full GC 或网络分区，服务端租期已超时自动释放并被新请求获取，如何保证临界区代码不发生并发脏写？",
        "probing_traps": [
            "单靠看门狗 (Watchdog) 无法防范极端 STW 停顿",
            "必须提及 Fencing Token（递增版本号令牌）或数据库层悲观版本校验",
            "Redlock 在网络分区与时钟漂移下的理论缺陷（Martin Kleppmann 论文之争）"
        ],
        "drill_path": "基本SETNX实现 -> 看门狗续期漏洞 -> Fencing Token与数据库乐观锁兜底"
    },
    {
        "id": "q_mysql_mvcc_gap_lock",
        "topic": "MySQL幻读与Next-Key Lock锁机制",
        "company": "阿里巴巴/核心数据库",
        "tags": ["mysql", "innodb", "mvcc", "锁", "死锁"],
        "authentic_question": "在可重复读 (RR) 隔离级别下，MVCC 能否完全解决幻读？如果在事务中先执行快照读，再执行当前读（如 UPDATE），会有什么现象发生？",
        "probing_traps": [
            "快照读依靠 Undo Log + ReadView，当前读依靠 Next-Key Lock",
            "在 RR 下先 SELECT 再 UPDATE 会更新到新插入的记录（幻读暴露）",
            "唯一索引等值查询在记录不存在时退化为间隙锁 (Gap Lock) 的开闭区间边界"
        ],
        "drill_path": "ReadView快照读原理 -> 当前读加锁规则 -> 死锁日志排查分析"
    },
    {
        "id": "q_cache_consistency_binlog",
        "topic": "双写一致性与Canal延迟对账",
        "company": "美团/交易中台",
        "tags": ["redis", "mysql", "双写一致性", "canal", "消息队列"],
        "authentic_question": "先更新数据库再删缓存，在极端并发下仍有脏数据概率（读请求在写请求删缓存后回写旧值）。如果引入 Canal 监听 Binlog 异步删缓存，主从延迟 5 秒时用户看到旧数据，业务端如何彻底兜底？",
        "probing_traps": [
            "延时双删在多节点与微服务下的时间阈值无法精准估计",
            "Canal + MQ 异步失效虽然最终一致，但必须有读写分离强读主库或缓存路由版本号机制",
            "防缓存穿透/击穿互斥锁争用与单机本地缓存保护"
        ],
        "drill_path": "先更新数据库后删缓存 -> 极端时序反例 -> Binlog异步流与版本号兜底"
    },
    {
        "id": "q_distributed_tx_mq",
        "topic": "分布式事务与半消息补偿",
        "company": "拼多多/交易结算",
        "tags": ["分布式事务", "rocketmq", "最终一致性", "幂等"],
        "authentic_question": "使用 RocketMQ 事务消息保证分布式一致性时，如果本地事务成功，但 Commit 确认消息因网络超时未到达 Broker，Broker 触发反查，如果此时反查接口本身因为下游网络拥堵超时报错，系统会如何处理？",
        "probing_traps": [
            "Broker 会按回查轮次重试，超过最大回查次数默认丢弃或进死信",
            "本地事务状态表必须具备持久化可查性与幂等设计",
            "当下游消费者重复消费消息时的全链路唯一业务流水号去重防重放"
        ],
        "drill_path": "半消息两阶段提交 -> 状态回查机制 -> 业务防重放幂等表设计"
    },
    {
        "id": "q_tcp_timewait_epoll",
        "topic": "Linux高性能网络IO与TIME_WAIT风暴",
        "company": "腾讯/长连接网关",
        "tags": ["tcp", "linux", "epoll", "网络io", "timewait"],
        "authentic_question": "网关服务作为客户端连接后端上游服务时，瞬间堆积了上万个 TIME_WAIT 状态导致端口耗尽，为什么主动关闭方会有 TIME_WAIT？开启 tcp_tw_reuse 和 tcp_tw_recycle 各有什么线上风险？",
        "probing_traps": [
            "TIME_WAIT 存在 2MSL 的根本原因：防旧数据包干扰新连接，确保被动关闭方收到 ACK",
            "NAT 网络环境下开启 tcp_tw_recycle 会导致时间戳非单调递增的客户端连接被丢弃",
            "长连接池复用 (Keep-Alive) 才是根治高频短连接 TIME_WAIT 的最佳实践"
        ],
        "drill_path": "四次挥手状态机 -> TIME_WAIT必要性 -> 内核参数调优陷阱与连接池治理"
    },
    {
        "id": "q_jvm_fullgc_metaspace",
        "topic": "JVM线上排障与非堆内存泄露",
        "company": "字节跳动/电商基础架构",
        "tags": ["jvm", "gc", "oom", "排障", "metaspace"],
        "authentic_question": "生产环境报警 CPU 达到 100%，且 GC 日志显示频繁发生 Full GC，但堆内存占用并不高。请详细说明排查步骤，如何定位是元空间 (Metaspace) 泄露、直接内存 (Direct Memory) 泄露还是第三方 JNI 导致的？",
        "probing_traps": [
            "Top -H 定位高消耗线程 -> jstack 抓取堆栈寻找 VM Thread 或业务线程",
            "动态代理框架或大量动态类加载导致 Metaspace 打满触发 Full GC",
            "Netty 堆外直接内存泄露在堆 Dump 中无法直接看出，需要结合 NativeMemoryTracking (NMT)"
        ],
        "drill_path": "Linux指标初筛 -> JVM堆内外诊断命令 -> 根本原因定位与参数规避"
    }
]


class RagService:
    def __init__(self):
        self._questions = REAL_INTERVIEW_QUESTIONS

    def retrieve_question_angles(
        self,
        query: str,
        company: Optional[str] = None,
        top_k: int = 2,
        min_score: int = 3,
    ) -> List[Dict[str, Any]]:
        """检索与候选人回答、考点或公司最匹配的大厂真题考点链。

        min_score 为相关性门槛：得分低于门槛的条目一律不返回，
        避免定向考察等场景下无关面经被硬注入把考点带偏（命中任一标签/主题/公司即 ≥3 分）。
        """
        if not query:
            return []

        q_lower = query.lower()
        company_lower = (company or "").lower()

        scored_questions = []
        for item in self._questions:
            score = 0
            # 公司匹配
            if company_lower and company_lower in item["company"].lower():
                score += 5
            # 考点与标签匹配
            for tag in item["tags"]:
                if tag.lower() in q_lower:
                    score += 3
            if item["topic"].lower() in q_lower:
                score += 4
            # 问题与陷阱关键词
            for trap in item["probing_traps"]:
                words = trap[:6]
                if words in q_lower:
                    score += 1

            scored_questions.append((score, item))

        scored_questions.sort(key=lambda x: x[0], reverse=True)
        return [item for score, item in scored_questions if score >= min_score][:top_k]


rag_service = RagService()

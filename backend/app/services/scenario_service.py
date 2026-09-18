"""
Company & Business Scenario Injection Service.
Provides deep, authentic architectural topologies, bottleneck constraints, and SLA metrics
for top tech companies (Meituan, ByteDance, PDD, Alibaba, Tencent) and vertical business domains.
"""

from typing import Dict, Any, Optional, List

COMPANY_SCENARIOS: List[Dict[str, Any]] = [
    {
        "id": "meituan_dispatch",
        "company": "美团",
        "business_domain": "即时配送履约与运力调度中台",
        "architecture_summary": "千万人机协同地理网格化调度系统，涉及骑手端海量长连接、S2/H3空间索引与实时派单引擎",
        "core_challenges": [
            "骑手在商场地下车库、电梯间等弱网/断网环境下的轨迹断流与状态同步",
            "恶劣天气或晚高峰骑手运力严重不足时的派单超时与动态运力重分配",
            "订单状态扭转（接单-到店-取餐-送达）的高并发状态机幂等与防并发脏写",
            "高频实时位置上报（峰值 10w+ QPS）对时序库与缓存的极致打压"
        ],
        "tech_stack_highlights": ["Golang", "Netty", "Redis Cluster", "H3空间索引", "Kafka", "时序数据库"],
        "sla_constraints": "派单决策端到端 P99 延迟 < 800ms，状态扭转零丢失，逆向退款分钟级对账",
        "exam_angle_hints": [
            "弱网环境下的数据断点续传与消息版本号对齐",
            "空间网格聚合算法在大促峰值下的计算资源瓶颈与降级策略",
            "订单履约超时后的自动化补偿与骑手风控判定"
        ]
    },
    {
        "id": "bytedance_recommendation",
        "company": "字节跳动",
        "business_domain": "推荐系统高并发在线特征工程与排序网关",
        "architecture_summary": "双十万级 QPS 在线打分网关，负责从多级缓存拉取数千维特征并流转至 TF/PyTorch 模型精排",
        "core_challenges": [
            "双十万 QPS 下微服务链路风暴与 P99 延迟毛刺（尾部延迟治理）",
            "多级缓存（本地缓存 + 分布式缓存）在热点事件瞬间的缓存击穿与内存穿透",
            "在线特征工程在特征服务异常时的优雅降级（退回静态冷启动特征）",
            "大规模微服务网络抖动与 gRPC 连接池争用治理"
        ],
        "tech_stack_highlights": ["Golang / C++", "gRPC", "自研多级缓存", "Kafka / Flink", "Redis", "Prometheus"],
        "sla_constraints": "在线特征拼装 P99 延迟严格控制在 30ms 以内，服务 SLA >= 99.99%",
        "exam_angle_hints": [
            "针对尾部延迟 (Tail Latency) 的防御性设计与超时对齐机制",
            "百万级用户同时刷新同一热点事件时，本地缓存与热点 Key 动态打散",
            "下游深度学习推理集群超时时，前置网关的熔断切流与兜底方案"
        ]
    },
    {
        "id": "pdd_trading",
        "company": "拼多多",
        "business_domain": "跨境电商出海(Temu)核心交易与热点库存中台",
        "architecture_summary": "海量拼团与高并发秒杀交易链路，极致追求成本效益与海量订单分布式扣减一致性",
        "core_challenges": [
            "海外跨多时区、多合规与多汇率结算对账的极端复杂性",
            "超高并发秒杀场景下热点 SKU 单行记录锁争用与数据库连接池打满",
            "网络跨国专线偶发抖动下的分布式事务与重复消息幂等落库",
            "极致降本增效要求下的单机吞吐榨取与冷热数据自动归档"
        ],
        "tech_stack_highlights": ["Java", "自研RPC框架", "Redis Cluster", "MySQL分库分表", "RocketMQ", "ClickHouse"],
        "sla_constraints": "秒杀单行每秒 2 万次扣减零超卖，亿级流水每日对账平账，服务器成本极致压缩",
        "exam_angle_hints": [
            "热点行锁拆分与内存分段扣减库存的并发与回滚一致性",
            "跨境网络延迟 200ms 以上时，异步化结账与最终一致性对账补偿",
            "极致降本背景下，如何通过零拷贝与内存复用榨干 JVM 单机性能"
        ]
    },
    {
        "id": "alibaba_cloud_native",
        "company": "阿里巴巴",
        "business_domain": "高可用核心中台与单元化多活架构",
        "architecture_summary": "异地多活三地五中心架构，应对极端机房故障的秒级单元切流与全局分布式事务保障",
        "core_challenges": [
            "跨机房网络延迟下，主备数据同步冲突与双向复制回环问题",
            "单机房光纤挖断或电力故障时，全局流量分钟级切换与脏数据隔离",
            "微服务数量万级以上时，配置变更瞬间导致的推送风暴与雪崩",
            "全链路压测中影子库表与生产数据的严格物理隔离与流量染色"
        ],
        "tech_stack_highlights": ["Java", "Spring Cloud / Dubbo", "PolarDB / OceanBase", "RocketMQ", "Sentinel", "Nacos"],
        "sla_constraints": "RPO ≈ 0 (数据零丢失)，RTO < 30 秒 (机房故障秒级自动恢复)",
        "exam_angle_hints": [
            "单元化多活架构中路由键 (Routing Key) 的设计与跨单元数据纠错",
            "全链路压测中流量染色、Mock 注入与影子表的真实设计细节",
            "分布式事务在长链路跨系统场景下的 TCC 与 Saga 兜底设计"
        ]
    },
    {
        "id": "tencent_im",
        "company": "腾讯",
        "business_domain": "高并发即时通信与海量长连接网关",
        "architecture_summary": "数亿长连接在线接入层与分布式消息路由网络，保障千万级群聊消息可靠不乱序投递",
        "core_challenges": [
            "数亿长连接并发心跳与断线重连风暴对接入层网关的冲击",
            "百万人群聊消息扇出 (Fan-out) 写扩散与读扩散的存储平衡",
            "弱网环境下的消息端到端必达（不丢单、不重复、时序单调递增）",
            "单机海量 TCP 连接下的 Linux 内核参数调优与 Epoll 惊群防范"
        ],
        "tech_stack_highlights": ["C++ / Go", "Linux 内核网络栈", "Epoll / io_uring", "Redis", "Kafka", "自研存储引擎"],
        "sla_constraints": "单机百万长连接内存 < 16GB，私聊端到端时延 < 100ms，群消息零乱序",
        "exam_angle_hints": [
            "长连接网关的优雅升级与平滑热重启 (Graceful Restart)",
            "离线消息与漫游消息的同步协议与客户端版本号对齐机制",
            "网络分区导致的消息重复与幂等去重窗口设计"
        ]
    }
]


class ScenarioService:
    def list_scenarios(self) -> List[Dict[str, Any]]:
        return COMPANY_SCENARIOS

    def match_scenario(
        self,
        company: str = "",
        business_domain: str = "",
        industry: str = "",
        job_role: str = ""
    ) -> Optional[Dict[str, Any]]:
        """根据企业名称、业务领域或行业关键词自动匹配真实大厂场景卡片。"""
        query_text = f"{company} {business_domain} {industry} {job_role}".lower()

        for s in COMPANY_SCENARIOS:
            if s["company"].lower() in query_text:
                return s
            if any(k.lower() in query_text for k in s["core_challenges"]):
                return s
            if s["business_domain"].lower() in query_text:
                return s

        # 行业默认回退
        if "外卖" in query_text or "配送" in query_text or "地图" in query_text:
            return COMPANY_SCENARIOS[0]  # 美团
        if "推荐" in query_text or "广告" in query_text or "流媒体" in query_text:
            return COMPANY_SCENARIOS[1]  # 字节
        if "电商" in query_text or "秒杀" in query_text or "拼团" in query_text:
            return COMPANY_SCENARIOS[2]  # 拼多多
        if "金融" in query_text or "交易" in query_text or "银行" in query_text:
            return COMPANY_SCENARIOS[3]  # 阿里/金融中台
        if "即时通信" in query_text or "社交" in query_text or "网关" in query_text or "长连接" in query_text:
            return COMPANY_SCENARIOS[4]  # 腾讯

        return None


scenario_service = ScenarioService()

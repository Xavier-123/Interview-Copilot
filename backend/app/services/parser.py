import json
import logging
from typing import Dict, Any
from langchain_core.messages import SystemMessage, HumanMessage
from app.agents.llm import llm_service

logger = logging.getLogger(__name__)

RESUME_PARSER_PROMPT = """你是一个专业的【简历信息抽取专家】。
请解析以下候选人简历文本，并提取关键结构化信息，严格返回纯 JSON 格式（无 markdown 包裹）：
```json
{{
  "name": "候选人姓名（如未提供则为'候选人'）",
  "experience_years": 4,
  "skills": ["Python", "FastAPI", "Redis", "高并发架构", "微服务"],
  "projects": [
    {{
      "name": "高并发电商订单履约中台",
      "role": "核心后端开发",
      "tech_stack": ["Python", "Go", "Kafka", "Redis"],
      "highlights": "优化核心链路，将超时率从3%降低到0.1%，支持万级QPS"
    }}
  ],
  "education": "某重点大学 计算机科学学士",
  "summary_profile": "具备4年后端高并发研发经验，精通Python微服务与分布式缓存"
}}
```
简历内容：
{resume_text}
"""

JD_PARSER_PROMPT = """你是一个专业的【岗位需求 (JD) 分析专家】。
请解析以下岗位描述 (Job Description) 文本，提取关键考核点与任职要求，严格返回纯 JSON 格式（无 markdown 包裹）：
```json
{{
  "title": "资深后端开发专家",
  "level": "senior",
  "required_skills": ["Python", "分布式系统", "高可用设计", "消息队列", "性能调优"],
  "preferred_skills": ["Go", "Kubernetes", "大模型落地实战"],
  "responsibilities": [
    "负责核心微服务架构设计与性能攻坚",
    "保障亿级流量下的系统稳定与高可用"
  ],
  "interview_focus": [
    "分布式一致性与缓存设计",
    "高并发容灾与压测复盘",
    "团队协作与技术难点攻关自驱力"
  ]
}}
```
岗位描述内容：
{jd_text}
"""

class DocumentParserService:
    async def parse_resume(self, resume_text: str) -> Dict[str, Any]:
        if not resume_text.strip():
            return {
                "name": "候选人",
                "experience_years": 3,
                "skills": ["Python", "微服务", "Redis", "MySQL", "Docker"],
                "projects": [
                    {
                        "name": "核心分布式业务系统",
                        "role": "资深开发",
                        "tech_stack": ["Python", "FastAPI", "Redis", "PostgreSQL"],
                        "highlights": "主导微服务架构重构，降低系统平均延迟40%"
                    }
                ],
                "education": "工学学士",
                "summary_profile": "具备多年后端微服务与系统高可用开发经验"
            }
        
        prompt = RESUME_PARSER_PROMPT.format(resume_text=resume_text)
        try:
            resp = await llm_service.invoke([HumanMessage(content=prompt)])
            content = resp.content.strip()
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
            return json.loads(content)
        except Exception as e:
            logger.warning(f"Resume parsing LLM failed: {e}. Returning fallback profile.")
            return {
                "name": "候选人",
                "experience_years": 3,
                "skills": ["Python", "后端架构", "Redis", "MySQL"],
                "projects": [{"name": "业务中台", "role": "核心研发", "tech_stack": ["Python", "MySQL"]}],
                "education": "本科",
                "summary_profile": "全栈/后端工程师，具备扎实开发与系统架构经验"
            }

    async def parse_jd(self, jd_text: str) -> Dict[str, Any]:
        if not jd_text.strip():
            return {
                "title": "高级研发工程师",
                "level": "senior",
                "required_skills": ["Python/Go", "分布式架构", "数据库优化", "缓存与消息队列"],
                "preferred_skills": ["高并发架构经验", "具备大型互联网项目实战"],
                "responsibilities": ["负责公司核心系统架构设计与业务交付"],
                "interview_focus": ["架构设计深度", "高可用与容灾", "STAR逻辑与团队协作"]
            }

        prompt = JD_PARSER_PROMPT.format(jd_text=jd_text)
        try:
            resp = await llm_service.invoke([HumanMessage(content=prompt)])
            content = resp.content.strip()
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
            return json.loads(content)
        except Exception as e:
            logger.warning(f"JD parsing LLM failed: {e}. Returning fallback JD requirements.")
            return {
                "title": "高级研发工程师",
                "level": "senior",
                "required_skills": ["后端研发", "高可用架构", "数据库调优"],
                "responsibilities": ["负责系统稳定与核心业务迭代"],
                "interview_focus": ["底层原理掌握度", "方案推演与批判性思考"]
            }

parser_service = DocumentParserService()

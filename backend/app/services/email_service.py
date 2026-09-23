import asyncio
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.header import Header
from email.utils import formataddr
from typing import Optional, Dict, Any
from datetime import datetime, timezone
import logging
from html import escape

logger = logging.getLogger(__name__)


def _format_time_str(dt: Optional[datetime]) -> str:
    if not dt:
        return ""
    # 格式化展示时间，如 2026-09-24 14:00 (UTC/本地)
    return dt.strftime("%Y-%m-%d %H:%M")


def render_reminder_html(
    company: str,
    job_role: str,
    interview_round: str,
    scheduled_at_str: str,
    location_type: str,
    meeting_link_or_address: Optional[str],
    salary: Optional[str],
    notes: Optional[str],
    jd_text: Optional[str],
    advance_notice: str = "即将开始",
) -> str:
    """生成排版精美、响应式的面试提醒 HTML 邮件内容。"""
    loc_display = "远程线上面试"
    if location_type == "onsite":
        loc_display = "线下现场面试"
    elif location_type == "phone":
        loc_display = "电话沟通/面试"

    company = escape(company or "")
    job_role = escape(job_role or "")
    interview_round = escape(interview_round or "")
    scheduled_at_str = escape(scheduled_at_str or "")
    salary = escape(salary or "")
    notes = escape(notes or "")
    jd_text = escape(jd_text or "")
    advance_notice = escape(advance_notice or "即将开始")
    raw_meeting_info = meeting_link_or_address.strip() if meeting_link_or_address else "未填写"
    meeting_info = escape(raw_meeting_info)
    if raw_meeting_info.startswith(("http://", "https://")):
        meeting_info_html = f'<a href="{meeting_info}" style="color: #3b82f6; word-break: break-all;" target="_blank" rel="noreferrer">{meeting_info}</a>'
    else:
        meeting_info_html = meeting_info

    salary_section = ""
    if salary:
        salary_section = f"""
        <div style="margin-top: 10px; padding: 10px 14px; background: #064e3b; border-radius: 8px; border: 1px solid #059669; color: #a7f3d0; font-size: 13px;">
          <strong>🎯 目标薪资：</strong> {salary}
        </div>
        """

    notes_section = ""
    if notes:
        notes_section = f"""
        <div style="margin-top: 14px; padding: 12px 16px; background: #1f2937; border-radius: 8px; border: 1px solid #374151; color: #e5e7eb; font-size: 13px; line-height: 1.6;">
          <div style="font-weight: bold; color: #9ca3af; margin-bottom: 4px; font-size: 12px;">📝 面经与重点备忘：</div>
          <div style="white-space: pre-wrap;">{notes}</div>
        </div>
        """

    jd_section = ""
    if jd_text:
        jd_snippet = jd_text.strip()[:400] + ("..." if len(jd_text.strip()) > 400 else "")
        jd_section = f"""
        <div style="margin-top: 14px; padding: 12px 16px; background: #111827; border-radius: 8px; border: 1px dashed #374151; color: #9ca3af; font-size: 12px; line-height: 1.6;">
          <div style="font-weight: bold; color: #6b7280; margin-bottom: 4px;">📋 岗位 JD 核心摘要：</div>
          <div style="white-space: pre-wrap; font-family: monospace;">{jd_snippet}</div>
        </div>
        """

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>面试提醒</title>
    </head>
    <body style="margin: 0; padding: 24px; background-color: #030712; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f9fafb;">
      <div style="max-width: 600px; margin: 0 auto; background: #111827; border: 1px solid #1f2937; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
        
        <!-- Header Banner -->
        <div style="background: linear-gradient(135deg, #1e3a8a 0%, #1e1b4b 100%); padding: 24px 28px; border-bottom: 1px solid #2563eb;">
          <div style="display: inline-block; padding: 4px 10px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 20px; color: #93c5fd; font-size: 12px; font-weight: bold; margin-bottom: 10px;">
            ⏰ 面试临近提醒 · {advance_notice}
          </div>
          <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">
            {company}
          </h1>
          <p style="margin: 6px 0 0 0; font-size: 15px; color: #93c5fd; font-weight: 500;">
            {job_role} · <span style="background: #1e293b; padding: 2px 8px; border-radius: 4px; font-size: 12px; color: #e2e8f0;">{interview_round}</span>
          </p>
        </div>

        <!-- Content Body -->
        <div style="padding: 24px 28px;">
          
          <!-- Key Info Box -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
            <tr>
              <td style="padding: 10px 0; color: #9ca3af; font-size: 13px; width: 90px; vertical-align: top;">🕒 面试时间：</td>
              <td style="padding: 10px 0; color: #f59e0b; font-size: 14px; font-weight: bold;">{scheduled_at_str}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: #9ca3af; font-size: 13px; vertical-align: top;">📍 形式与地点：</td>
              <td style="padding: 10px 0; color: #e5e7eb; font-size: 13px;">{loc_display} - {meeting_info_html}</td>
            </tr>
          </table>

          {salary_section}
          {notes_section}
          {jd_section}

          <!-- Action Tip -->
          <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #1f2937; text-align: center;">
            <p style="margin: 0 0 12px 0; color: #9ca3af; font-size: 13px;">
              准备好大展身手了吗？建议提前进入 Interview-Copilot 针对该岗位进行多面试官高仿真推演！
            </p>
            <div style="display: inline-block; padding: 10px 22px; background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #ffffff; font-size: 13px; font-weight: bold; border-radius: 8px; text-decoration: none;">
              🤖 打开 Interview-Copilot 开始备战
            </div>
          </div>

        </div>

        <!-- Footer -->
        <div style="background: #0b0f19; padding: 14px 28px; text-align: center; border-top: 1px solid #1f2937; color: #6b7280; font-size: 11px;">
          本邮件由 Interview-Copilot 个人求职中枢自动发送 · 如需调整提醒频次请在系统日程中设置
        </div>

      </div>
    </body>
    </html>
    """
    return html


def render_test_email_html(receiver_email: str) -> str:
    """生成测试连通性邮件的 HTML 内容。"""
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    return f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="margin:0; padding:24px; background:#030712; font-family:-apple-system,BlinkMacSystemFont,sans-serif; color:#f9fafb;">
      <div style="max-width:550px; margin:0 auto; background:#111827; border:1px solid #22c55e; border-radius:14px; padding:24px; box-shadow:0 8px 24px rgba(0,0,0,0.4);">
        <div style="display:flex; align-items:center; margin-bottom:12px;">
          <h2 style="margin:0; color:#22c55e; font-size:18px;">🎉 SMTP 邮件服务配置测试成功！</h2>
        </div>
        <p style="color:#d1d5db; font-size:14px; line-height:1.6;">
          您好！这是一封来自 <strong>Interview-Copilot</strong> 的测试邮件。
        </p>
        <div style="background:#1f2937; padding:12px 16px; border-radius:8px; margin:16px 0; font-size:13px; color:#9ca3af;">
          <div><strong>接收目标：</strong> <span style="color:#e5e7eb;">{receiver_email}</span></div>
          <div style="margin-top:6px;"><strong>测试时间：</strong> <span style="color:#e5e7eb;">{now_str}</span></div>
          <div style="margin-top:6px;"><strong>状态：</strong> <span style="color:#22c55e;">✔ 邮箱连通性正常，后续可在面试临近前自动接收提醒。</span></div>
        </div>
        <p style="color:#6b7280; font-size:12px; margin:0;">Interview-Copilot 自动化通知服务</p>
      </div>
    </body>
    </html>
    """


def send_smtp_email_sync(
    host: str,
    port: int,
    user: str,
    password: str,
    use_ssl: bool,
    from_name: str,
    to_email: str,
    subject: str,
    html_content: str,
    text_content: Optional[str] = None,
    timeout: int = 15,
) -> Dict[str, Any]:
    """同步发送邮件底层实现（由 asyncio.to_thread 包装调用）。"""
    if not host or not user or not password or not to_email:
        raise ValueError("SMTP host, user, password and recipient email must all be provided.")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = Header(subject, "utf-8")
    msg["From"] = formataddr((str(Header(from_name or "Interview-Copilot", "utf-8")), user))
    msg["To"] = to_email

    # Plain text fallback
    if not text_content:
        text_content = f"{subject}\n\n请使用支持 HTML 的邮件客户端查看完整内容。"
    msg.attach(MIMEText(text_content, "plain", "utf-8"))

    # HTML part
    msg.attach(MIMEText(html_content, "html", "utf-8"))

    try:
        if use_ssl or port == 465:
            server = smtplib.SMTP_SSL(host, port, timeout=timeout)
        else:
            server = smtplib.SMTP(host, port, timeout=timeout)
            try:
                server.starttls()
            except Exception as e:
                logger.info(f"STARTTLS not supported or skipped: {e}")

        server.login(user, password)
        server.sendmail(user, [to_email], msg.as_string())
        server.quit()
        return {"success": True, "message": "邮件发送成功"}
    except Exception as e:
        logger.error(f"SMTP sendmail error: {e}", exc_info=True)
        raise RuntimeError(f"邮件发送失败: {str(e)}")


async def send_smtp_email(
    host: str,
    port: int,
    user: str,
    password: str,
    use_ssl: bool,
    from_name: str,
    to_email: str,
    subject: str,
    html_content: str,
    text_content: Optional[str] = None,
) -> Dict[str, Any]:
    """非阻塞异步调用 SMTP 发送邮件。"""
    return await asyncio.to_thread(
        send_smtp_email_sync,
        host=host,
        port=port,
        user=user,
        password=password,
        use_ssl=use_ssl,
        from_name=from_name,
        to_email=to_email,
        subject=subject,
        html_content=html_content,
        text_content=text_content,
    )

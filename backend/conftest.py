import os
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# 测试套件强制 mock 模式：屏蔽真实 LLM 网络调用（确定性 + 快速）。
# 必须在 app 导入（Settings 实例化）前设置；真实环境变量优先级高于 .env 文件。
os.environ["ENABLE_MOCK_MODE"] = "true"

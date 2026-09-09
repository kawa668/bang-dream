import argparse
import os
import sys
import tempfile

import torch
from fastapi import FastAPI, File, Form, Request, UploadFile
from faster_whisper import WhisperModel
from fastapi.responses import JSONResponse


def resolve_model_dir(gpt_sovits_dir: str, model_size: str) -> str:
    """返回本地模型目录；不存在时复用 GPT-SoVITS 的 download_model 下载。"""
    model_path = os.path.join(
        gpt_sovits_dir, "tools", "asr", "models", f"faster-whisper-{model_size}"
    )
    if os.path.isdir(model_path):
        return model_path
    # 仅需要下载时才引入 tools.asr，避免模型已缓存时启动被 FunASR 拖慢。
    sys.path.insert(0, gpt_sovits_dir)
    from tools.asr.fasterwhisper_asr import download_model

    download_model(model_size)
    return os.path.join(
        gpt_sovits_dir, "tools", "asr", "models", f"faster-whisper-{model_size}"
    )


app = FastAPI()
model = None
args = None


@app.on_event("startup")
def load_model():
    global model
    model_path = resolve_model_dir(args.gpt_sovits_dir, args.model_size)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    compute = args.precision
    if compute == "auto":
        compute = "float16" if device == "cuda" else "int8"
    print(f"[asr] loading model {model_path} device={device} precision={compute}")
    model = WhisperModel(model_path, device=device, compute_type=compute)
    print("[asr] model ready")


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/control")
def control(request: Request):
    if request.query_params.get("command") == "exit":
        os._exit(0)
    return {"ok": True}


@app.post("/transcribe")
def transcribe(file: UploadFile = File(...), language: str = Form("auto")):
    suffix = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(file.file.read())
        tmp_path = tmp.name
    try:
        lang = None if language == "auto" else language
        segments, info = model.transcribe(
            audio=tmp_path,
            beam_size=5,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500},
            language=lang,
        )
        text = "".join(segment.text for segment in segments).strip()
        return JSONResponse({"text": text})
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


if __name__ == "__main__":
    import uvicorn

    parser = argparse.ArgumentParser()
    parser.add_argument("--gpt-sovits-dir", required=True)
    parser.add_argument("-a", "--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=9881)
    parser.add_argument("-s", "--model-size", default="large-v3-turbo")
    parser.add_argument("-l", "--language", default="auto")
    parser.add_argument("--precision", default="auto")
    args = parser.parse_args()
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")

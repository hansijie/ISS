#!/bin/bash
#
# OpenClaw ISS - S3 Vectors 初始化脚本
# 
# 功能：
# 1. 创建 S3 通用桶
# 2. 启用 S3 Vectors（如果支持）
# 3. 配置 IAM 权限（可选）
#

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}OpenClaw ISS - S3 Vectors 初始化${NC}"
echo -e "${BLUE}========================================${NC}\n"

# 读取配置
GP_BUCKET_NAME=${OPENCLAW_SKILLS_GP_BUCKET:-openclaw-skills-vectors}
VECTOR_BUCKET_NAME=${OPENCLAW_SKILLS_VECTOR_BUCKET:-openclaw-skills-vectors}
VECTOR_INDEX_NAME=${OPENCLAW_SKILLS_VECTOR_INDEX:-skills}
AWS_REGION=${AWS_REGION:-us-east-1}
DIMENSION=1024
DISTANCE_METRIC="cosine"
AWS_REGION=${AWS_REGION:-us-east-1}

echo -e "${BLUE}配置:${NC}"
echo -e "  S3 General Purpose Bucket: ${GREEN}${GP_BUCKET_NAME}${NC}"
echo -e "  S3 Vectors Bucket:         ${GREEN}${VECTOR_BUCKET_NAME}${NC}"
echo -e "  S3 Vectors Index:          ${GREEN}${VECTOR_INDEX_NAME}${NC}"
echo -e "    - Dimensions:            ${GREEN}${DIMENSION}${NC}"
echo -e "    - Distance Metric:       ${GREEN}${DISTANCE_METRIC}${NC}"
echo -e "  AWS Region:                ${GREEN}${AWS_REGION}${NC}\n"

# 检查 AWS CLI
if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ Error: AWS CLI not found${NC}"
    echo -e "   Please install AWS CLI first: https://aws.amazon.com/cli/"
    exit 1
fi

# 检查 AWS 凭证
echo -e "${YELLOW}🔑 Checking AWS credentials...${NC}"
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}❌ Error: AWS credentials not configured${NC}"
    echo -e "   Please run: ${GREEN}aws configure${NC}"
    exit 1
fi

echo -e "${GREEN}✅ AWS credentials configured${NC}\n"

# 1. 创建 S3 桶
echo -e "${YELLOW}📦 Creating S3 General purpose bucket: ${GP_BUCKET_NAME}${NC}"

# 检查桶是否已存在
if aws s3api head-bucket --bucket "${GP_BUCKET_NAME}" 2>/dev/null; then
    echo -e "${YELLOW}⚠️  Bucket already exists, skipping creation${NC}\n"
else
    # 根据区域选择不同的创建命令
    if [ "${AWS_REGION}" = "us-east-1" ]; then
        aws s3api create-bucket \
            --bucket "${GP_BUCKET_NAME}" \
            --region "${AWS_REGION}"
    else
        aws s3api create-bucket \
            --bucket "${GP_BUCKET_NAME}" \
            --region "${AWS_REGION}" \
            --create-bucket-configuration LocationConstraint="${AWS_REGION}"
    fi
    
    echo -e "${GREEN}✅ Bucket created successfully${NC}\n"
fi

# 2. 启用版本控制（推荐）
echo -e "${YELLOW}🔄 Enabling versioning...${NC}"
aws s3api put-bucket-versioning \
    --bucket "${GP_BUCKET_NAME}" \
    --versioning-configuration Status=Enabled

echo -e "${GREEN}✅ Versioning enabled${NC}\n"

# 3. 启用 S3 Vectors（如果支持）
echo -e "${YELLOW}🔍 Attempting to enable S3 Vectors...${NC}"

# 注意：S3 Vectors 在部分区域可用
# 如果 API 不可用，会失败，但不影响 ISS 使用（会自动回退到客户端搜索）
echo -e "${YELLOW}📦 Creating S3 Vectors Bucket: ${VECTOR_BUCKET_NAME}${NC}"

if aws s3vectors create-vector-bucket \
    --vector-bucket-name "${VECTOR_BUCKET_NAME}" \
    --region "${AWS_REGION}" 2>/dev/null; then
    echo -e "${GREEN}✅ S3 Vectors Bucket created${NC}\n"
else
    echo -e "${YELLOW}⚠️  S3 Vectors Bucket may already exist, continuing...${NC}\n"
fi

# 2. 创建 Vector Index
echo -e "${YELLOW}📇 Creating S3 Vectors Index: ${VECTOR_INDEX_NAME}${NC}"

if aws s3vectors create-vector-index \
    --vector-bucket-name "${VECTOR_BUCKET_NAME}" \
    --index-name "${VECTOR_INDEX_NAME}" \
    --dimension "${DIMENSION}" \
    --distance-metric "${DISTANCE_METRIC}" \
    --region "${AWS_REGION}" 2>/dev/null; then
    echo -e "${GREEN}✅ S3 Vectors Index created${NC}\n"
else
    echo -e "${YELLOW}⚠️  S3 Vectors Index may already exist, continuing...${NC}\n"
fi

# 4. 设置桶策略（可选，根据需要）
echo -e "${YELLOW}🔒 Setting bucket policy...${NC}"

POLICY="{
    \"Version\": \"2012-10-17\",
    \"Statement\": [
        {
            \"Sid\": \"AllowOpenClawAccess\",
            \"Effect\": \"Allow\",
            \"Principal\": {
                \"AWS\": \"$(aws sts get-caller-identity --query 'Arn' --output text)\"
            },
            \"Action\": [
                \"s3:GetObject\",
                \"s3:PutObject\",
                \"s3:ListBucket\"
            ],
            \"Resource\": [
                \"arn:aws:s3:::${GP_BUCKET_NAME}\",
                \"arn:aws:s3:::${GP_BUCKET_NAME}/*\"
            ]
        }
    ]
}"

if aws s3api put-bucket-policy \
    --bucket "${GP_BUCKET_NAME}" \
    --policy "${POLICY}" 2>/dev/null; then
    echo -e "${GREEN}✅ Bucket policy set${NC}\n"
else
    echo -e "${YELLOW}⚠️  Could not set bucket policy (may require additional permissions)${NC}\n"
fi

# 5. 创建 skills/ 前缀（可选）
echo -e "${YELLOW}📁 Creating skills/ prefix...${NC}"
echo "" | aws s3 cp - "s3://${GP_BUCKET_NAME}/skills/.keep" --content-type text/plain
echo -e "${GREEN}✅ Prefix created${NC}\n"

# 完成
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ S3 Vectors 初始化完成！${NC}"
echo -e "${GREEN}========================================${NC}\n"

echo -e "${BLUE}下一步:${NC}"
echo -e "  1. 向量化 skills:"
echo -e "     ${GREEN}npm run vectorize${NC}"
echo -e "  2. 启用 ISS 扩展:"
echo -e "     编辑 ${GREEN}~/.openclaw/openclaw.json${NC}"
echo -e "  3. 重启 OpenClaw:"
echo -e "     ${GREEN}openclaw restart${NC}\n"

echo -e "${YELLOW}💡 提示:${NC}"
echo -e "  如果 S3 Vectors API 不可用，ISS 仍然可以工作！"
echo -e "  它会自动使用客户端向量搜索（性能略低，但功能完整）\n"

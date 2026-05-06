import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';

import { AdminService } from '../service/admin.service';
import { UserGuard } from 'src/security/guards/auth.guard';
import { RoleGuard } from 'src/security/guards/role.guard';

import {
  UpdateUserRoleDto,
  UpdateUserCreditsDto,
  CreateCreditPlanDto,
  TransactionFilterDto,
  ApplicationFilterDto,
  PaginationDto,
  GetUsersDto,
} from '../dto/admin.dto';

import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { Roles } from 'src/security/guards/roles.decorator';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(UserGuard, RoleGuard)
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  // ================= DASHBOARD =================
  @Get('dashboard')
  @ApiOperation({ summary: 'Get admin dashboard overview' })
  @ApiResponse({
    status: 200,
    description: 'Dashboard statistics retrieved successfully',
  })
  getDashboard() {
    return this.adminService.getDashboard();
  }

  // ================= USERS =================
  @Get('users')
  @ApiOperation({ summary: 'Get all users (paginated + search + filter)' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({
    name: 'search',
    required: false,
    example: 'emmanuel',
    description: 'Search by full name or email',
  })
  @ApiQuery({
    name: 'role',
    required: false,
    example: 'admin',
    description: 'Filter by role',
  })
  @ApiResponse({
    status: 200,
    description: 'Users retrieved successfully',
  })
  getUsers(@Query() query: GetUsersDto) {
    return this.adminService.getUsers(query);
  }

  @Patch('users/:id/role')
  @ApiOperation({ summary: 'Update user role (user/admin)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiBody({ type: UpdateUserRoleDto })
  @ApiResponse({
    status: 200,
    description: 'User role updated successfully',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  updateRole(@Param('id') id: string, @Body() body: UpdateUserRoleDto) {
    return this.adminService.updateUserRole(id, body.role);
  }

  @Patch('users/:id/credits')
  @ApiOperation({ summary: 'Update user credits manually' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiBody({ type: UpdateUserCreditsDto })
  @ApiResponse({
    status: 200,
    description: 'User credits updated successfully',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  updateCredits(@Param('id') id: string, @Body() body: UpdateUserCreditsDto) {
    return this.adminService.updateUserCredits(id, body.credits);
  }

  // ================= CREDIT PLANS =================
  @Post('plans')
  @ApiOperation({ summary: 'Create a new credit plan' })
  @ApiBody({ type: CreateCreditPlanDto })
  @ApiResponse({
    status: 201,
    description: 'Credit plan created successfully',
  })
  createPlan(@Body() body: CreateCreditPlanDto) {
    return this.adminService.createPlan(body);
  }

  @Get('plans')
  @ApiOperation({ summary: 'Get all credit plans' })
  @ApiResponse({
    status: 200,
    description: 'Credit plans retrieved successfully',
  })
  getPlans() {
    return this.adminService.getPlans();
  }

  @Patch('plans/:id')
  @ApiOperation({ summary: 'Update a credit plan' })
  @ApiParam({ name: 'id', description: 'Credit Plan ID' })
  @ApiBody({ type: CreateCreditPlanDto })
  @ApiResponse({
    status: 200,
    description: 'Credit plan updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  updatePlan(@Param('id') id: string, @Body() body: CreateCreditPlanDto) {
    return this.adminService.updatePlan(id, body);
  }

  @Patch('plans/:id/toggle')
  @ApiOperation({ summary: 'Toggle credit plan active status' })
  @ApiParam({ name: 'id', description: 'Credit Plan ID' })
  @ApiResponse({
    status: 200,
    description: 'Credit plan status toggled successfully',
  })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  togglePlan(@Param('id') id: string) {
    return this.adminService.togglePlan(id);
  }

  // ================= TRANSACTIONS =================
  @Get('transactions')
  @ApiOperation({ summary: 'Get all transactions (filtered & paginated)' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({
    name: 'type',
    required: false,
    example: 'purchase',
    description: 'Filter by transaction type (purchase | usage)',
  })
  @ApiResponse({
    status: 200,
    description: 'Transactions retrieved successfully',
  })
  getTransactions(@Query() query: TransactionFilterDto) {
    return this.adminService.getTransactions(query);
  }

  // ================= APPLICATIONS =================
  @Get('applications')
  @ApiOperation({ summary: 'Get all application history (filtered)' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({
    name: 'jobTitle',
    required: false,
    example: 'Backend Engineer',
  })
  @ApiResponse({
    status: 200,
    description: 'Applications retrieved successfully',
  })
  getApplications(@Query() query: ApplicationFilterDto) {
    return this.adminService.getApplications(query);
  }
}
